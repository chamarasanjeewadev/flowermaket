import type { EnquiryLocale } from "./whatsapp";

export type QuotationUnit =
  | "stem"
  | "bunch"
  | "arrangement"
  | "item"
  | "service";

export interface QuotationLine {
  id: string;
  name: string;
  quantity: number;
  /** Unit price in LKR cents. */
  unitPrice: number;
  unit: QuotationUnit;
  productSlug?: string;
}

export interface QuotationDetails {
  plannerName?: string;
  clientName?: string;
  eventDate?: string;
  venue?: string;
  notes?: string;
}

export interface BuildQuotationTextInput {
  lines: readonly QuotationLine[];
  details?: QuotationDetails;
  locale: EnquiryLocale;
  siteUrl: string;
}

function validInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function quotationLineTotal(line: QuotationLine): number {
  return validInteger(line.quantity) * validInteger(line.unitPrice);
}

export function quotationTotal(lines: readonly QuotationLine[]): number {
  return lines.reduce((total, line) => total + quotationLineTotal(line), 0);
}

/** "Rs 1,250" with deterministic grouping and no runtime locale dependency. */
export function formatQuotationRupees(cents: number): string {
  const rupees = Math.round(validInteger(cents) / 100);
  return `Rs ${rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function unitLabel(unit: QuotationUnit, quantity: number): string {
  if (quantity === 1) return unit;
  if (unit === "bunch") return "bunches";
  return `${unit}s`;
}

/** Build an itemised order-request message from a planner's quotation. */
export function buildQuotationText(input: BuildQuotationTextInput): string {
  const { details, locale } = input;
  const base = input.siteUrl.replace(/\/$/, "");
  const lines = input.lines.filter(
    (line) => line.name.trim() && line.quantity > 0,
  );
  const output: string[] = ["FlowerMarket.lk wedding flower order request", ""];

  if (lines.length === 0) {
    output.push("I would like help preparing a flower quotation.");
  } else {
    output.push("Quotation items:", "");
    lines.forEach((line, index) => {
      const quantity = validInteger(line.quantity);
      output.push(
        `${index + 1}. ${line.name.trim()} - ${quantity} ${unitLabel(line.unit, quantity)} x ${formatQuotationRupees(line.unitPrice)} = ${formatQuotationRupees(quotationLineTotal(line))}`,
      );
      if (line.productSlug) {
        output.push(`   ${base}/${locale}/products/${line.productSlug}`);
      }
    });
    output.push("", `Estimated total: ${formatQuotationRupees(quotationTotal(lines))}`);
  }

  const eventDetails: string[] = [];
  if (details?.plannerName?.trim()) {
    eventDetails.push(`Planner/contact: ${details.plannerName.trim()}`);
  }
  if (details?.clientName?.trim()) {
    eventDetails.push(`Client/couple: ${details.clientName.trim()}`);
  }
  if (details?.eventDate?.trim()) {
    eventDetails.push(`Event date: ${details.eventDate.trim()}`);
  }
  if (details?.venue?.trim()) {
    eventDetails.push(`Venue/delivery area: ${details.venue.trim()}`);
  }
  if (details?.notes?.trim()) {
    eventDetails.push(`Notes: ${details.notes.trim()}`);
  }
  if (eventDetails.length > 0) {
    output.push("", "Event details:", ...eventDetails);
  }

  output.push(
    "",
    "Please confirm availability, flower condition, delivery, and the final price before processing this order.",
  );
  return output.join("\n");
}
