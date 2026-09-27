/**
 * PDF document renderer for FlowerMarket.lk documents (quotations, invoices, receipts).
 *
 * Pure pdf-lib + JS built-ins — no @flowers/api import. Safe in Cloudflare Workers.
 * All money values are integer LKR cents; local formatRupees() converts for display.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentType = "quotation" | "invoice" | "receipt";

export interface DocumentCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
}

export interface DocumentLine {
  descriptionEn: string;
  descriptionSi: string | null;
  variant: string | null;
  qty: number;
  unit: string;
  /** Integer LKR cents. */
  unitPrice: number;
  /** Integer LKR cents. */
  lineTotal: number;
}

export interface DocumentPdfInput {
  type: DocumentType;
  docNo: string;
  issuedAt: string; // ISO date string e.g. "2026-09-27"
  customer: DocumentCustomer;
  lines: DocumentLine[];
  /** All money fields are integer LKR cents. */
  subtotal: number;
  discount: number;
  deliveryFee: number;
  taxAmount: number;
  total: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format integer LKR cents → "Rs 1,234.50" */
function formatRupees(cents: number): string {
  const rupees = cents / 100;
  const [intPart, decPart] = rupees.toFixed(2).split(".");
  const grouped = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs ${grouped}.${decPart ?? "00"}`;
}

function docTypeLabel(type: DocumentType): string {
  switch (type) {
    case "quotation":
      return "QUOTATION";
    case "invoice":
      return "INVOICE";
    case "receipt":
      return "RECEIPT";
  }
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595; // A4 points
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number; // current y position (top-down tracking)
}

function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
): void {
  const size = opts.size ?? 10;
  const f = opts.bold ? ctx.boldFont : ctx.font;
  const col = opts.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0, 0, 0);
  ctx.page.drawText(text, { x, y: PAGE_HEIGHT - ctx.y, font: f, size, color: col });
}

function lineHeight(size: number): number {
  return size * 1.6;
}

function drawHRule(ctx: DrawCtx, color: [number, number, number] = [0.8, 0.8, 0.8]): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: PAGE_HEIGHT - ctx.y },
    thickness: 0.5,
    color: rgb(color[0], color[1], color[2]),
  });
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const ctx: DrawCtx = { page, font, boldFont, y: MARGIN };

  // -------------------------------------------------------------------------
  // Header: brand + document type
  // -------------------------------------------------------------------------
  drawText(ctx, "FlowerMarket.lk", MARGIN, { size: 18, bold: true, color: [0.8, 0.3, 0.1] });
  ctx.y += lineHeight(18);

  drawText(ctx, "Sri Lanka's online flower marketplace", MARGIN, { size: 9, color: [0.4, 0.4, 0.4] });
  ctx.y += lineHeight(9);

  drawText(ctx, "hi@flowermarket.lk", MARGIN, { size: 9, color: [0.4, 0.4, 0.4] });
  ctx.y += lineHeight(9) + 6;

  drawHRule(ctx);
  ctx.y += 10;

  // Document type + number + date (two columns)
  drawText(ctx, docTypeLabel(input.type), MARGIN, { size: 14, bold: true });
  drawText(ctx, `#${input.docNo}`, MARGIN + 120, { size: 12 });
  drawText(ctx, `Date: ${input.issuedAt}`, MARGIN + CONTENT_WIDTH - 130, { size: 10 });
  ctx.y += lineHeight(14) + 4;

  drawHRule(ctx);
  ctx.y += 14;

  // -------------------------------------------------------------------------
  // Customer block
  // -------------------------------------------------------------------------
  drawText(ctx, "Bill To:", MARGIN, { size: 10, bold: true });
  ctx.y += lineHeight(10);

  drawText(ctx, input.customer.name, MARGIN + 8, { size: 10, bold: true });
  ctx.y += lineHeight(10);

  if (input.customer.phone) {
    drawText(ctx, `Phone: ${input.customer.phone}`, MARGIN + 8, { size: 9 });
    ctx.y += lineHeight(9);
  }
  if (input.customer.email) {
    drawText(ctx, `Email: ${input.customer.email}`, MARGIN + 8, { size: 9 });
    ctx.y += lineHeight(9);
  }
  const locationParts = [input.customer.address, input.customer.city, input.customer.district].filter(Boolean);
  if (locationParts.length > 0) {
    drawText(ctx, locationParts.join(", "), MARGIN + 8, { size: 9 });
    ctx.y += lineHeight(9);
  }

  ctx.y += 10;
  drawHRule(ctx);
  ctx.y += 10;

  // -------------------------------------------------------------------------
  // Line-item table header
  // -------------------------------------------------------------------------
  const COL = {
    desc: MARGIN,
    qty: MARGIN + CONTENT_WIDTH * 0.52,
    unitPrice: MARGIN + CONTENT_WIDTH * 0.68,
    lineTotal: MARGIN + CONTENT_WIDTH * 0.85,
  };

  drawText(ctx, "Description", COL.desc, { size: 9, bold: true });
  drawText(ctx, "Qty × Unit", COL.qty, { size: 9, bold: true });
  drawText(ctx, "Unit Price", COL.unitPrice, { size: 9, bold: true });
  drawText(ctx, "Line Total", COL.lineTotal, { size: 9, bold: true });
  ctx.y += lineHeight(9);
  drawHRule(ctx, [0.6, 0.6, 0.6]);
  ctx.y += 8;

  // -------------------------------------------------------------------------
  // Line items
  // -------------------------------------------------------------------------
  for (const line of input.lines) {
    const desc = truncate(line.descriptionEn, 52);
    const variantLabel = line.variant ? ` (${line.variant})` : "";
    drawText(ctx, desc + variantLabel, COL.desc, { size: 9 });
    drawText(ctx, `${line.qty} × ${line.unit}`, COL.qty, { size: 9 });
    drawText(ctx, formatRupees(line.unitPrice), COL.unitPrice, { size: 9 });
    drawText(ctx, formatRupees(line.lineTotal), COL.lineTotal, { size: 9 });
    ctx.y += lineHeight(9);

    // Sinhala description as a sub-line if present
    if (line.descriptionSi) {
      drawText(ctx, truncate(line.descriptionSi, 60), COL.desc + 8, { size: 8, color: [0.4, 0.4, 0.4] });
      ctx.y += lineHeight(8);
    }
  }

  ctx.y += 4;
  drawHRule(ctx);
  ctx.y += 10;

  // -------------------------------------------------------------------------
  // Totals block (right-aligned)
  // -------------------------------------------------------------------------
  const TOTALS_LABEL_X = MARGIN + CONTENT_WIDTH * 0.6;
  const TOTALS_VALUE_X = MARGIN + CONTENT_WIDTH * 0.85;

  function drawTotalRow(label: string, cents: number, bold = false): void {
    drawText(ctx, label, TOTALS_LABEL_X, { size: 9, bold });
    drawText(ctx, formatRupees(cents), TOTALS_VALUE_X, { size: 9, bold });
    ctx.y += lineHeight(9);
  }

  drawTotalRow("Subtotal:", input.subtotal);
  if (input.discount > 0) drawTotalRow("Discount:", -input.discount);
  if (input.deliveryFee > 0) drawTotalRow("Delivery:", input.deliveryFee);
  if (input.taxAmount > 0) drawTotalRow("Tax:", input.taxAmount);

  ctx.y += 2;
  drawHRule(ctx, [0.4, 0.4, 0.4]);
  ctx.y += 8;
  drawTotalRow(`Total (${input.currency}):`, input.total, true);

  // -------------------------------------------------------------------------
  // Footer
  // -------------------------------------------------------------------------
  ctx.y = PAGE_HEIGHT - MARGIN - 20; // pin to bottom margin
  drawHRule(ctx, [0.8, 0.8, 0.8]);
  ctx.y += 8;
  drawText(ctx, "Thank you for choosing FlowerMarket.lk  •  hi@flowermarket.lk", MARGIN, {
    size: 8,
    color: [0.5, 0.5, 0.5],
  });

  return pdf.save();
}
