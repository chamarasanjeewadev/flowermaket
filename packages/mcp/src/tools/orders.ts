/**
 * Order fulfilment tools: intake → RFQ → award → quotation/invoice/receipt.
 * Mirrors apps/admin/src/server/orders.ts, including the order-status side
 * effects of issuing/accepting/paying documents.
 */
import { z } from "zod";
import {
  DISTRICTS,
  ORDER_SOURCES,
  ORDER_UNITS,
  acceptDocument,
  buildDocumentDraft,
  cancelAward,
  createAward,
  createOrder,
  createRfqs,
  err,
  getOrder,
  issueDocument,
  listOrders,
  markPaid,
  matchRoseGrowers,
  ok,
  orderCostRollup,
  resolveRfqDispatchInfo,
  updateOrderStatus,
  type Db,
  type RfqDispatchInfo,
} from "@flowers/api";
import {
  buildDocumentLinkMessage,
  buildRfqNudge,
  type EvolutionConfig,
} from "@flowers/integrations";
import type { Ctx } from "../context";
import { sendAndLog } from "../whatsapp-send";
import { cents, defineTool, uuid, type AnyTool } from "../tool";

const orderStatus = z.enum([
  "draft",
  "sourcing",
  "quoted",
  "confirmed",
  "invoiced",
  "paid",
  "fulfilling",
  "completed",
  "cancelled",
]);
const documentType = z.enum(["quotation", "invoice", "receipt"]);
// Same allow-lists the repo validates against, so agents see them in the schema.
const districtSlugs = DISTRICTS.map((d) => d.slug);
const district = z
  .string()
  .refine((v) => districtSlugs.includes(v), { message: `Use a district slug: ${districtSlugs.join(", ")}` })
  .describe(`District slug, one of: ${districtSlugs.join(", ")}`);

const orderItem = z.object({
  descriptionEn: z.string().min(1).describe("What the customer wants, in English"),
  descriptionSi: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  unit: z.enum(ORDER_UNITS).describe("stem | bunch | box — put bouquet/arrangement detail in variant/notes"),
  variant: z.string().nullable().optional().describe("Colour/size/grade, e.g. 'red, 50cm'"),
  categoryId: z.string().uuid().nullable().optional().describe("From list_categories"),
  notes: z.string().nullable().optional(),
});

interface NudgeResult {
  rfqId: string;
  supplierShopId: string;
  shopName: string;
  sent: boolean;
  error?: string;
}

/** WhatsApp the supplier a deep link to the RFQ on the supplier portal. Never throws. */
async function nudgeSupplier(
  db: Db,
  config: EvolutionConfig,
  portalUrl: string,
  info: RfqDispatchInfo,
): Promise<NudgeResult> {
  const base = { rfqId: info.rfqId, supplierShopId: info.supplierShopId, shopName: info.shopName };
  if (!info.phone) return { ...base, sent: false, error: "Supplier has no phone number on record." };
  const message = buildRfqNudge({
    shopName: info.shopName,
    orderNo: info.orderNo,
    portalUrl: `${portalUrl}/rfqs/${info.rfqId}`,
    locale: "en",
  });
  const res = await sendAndLog(db, config, info.phone, message);
  return res.ok ? { ...base, sent: true } : { ...base, sent: false, error: res.message };
}

function portalUrl(ctx: Ctx): string {
  return (ctx.env().SUPPLIER_PORTAL_URL ?? "").replace(/\/$/, "");
}

export const orderTools: AnyTool[] = [
  defineTool({
    name: "list_orders",
    title: "List orders",
    description: "Recent orders (newest first) with order number, customer, status and needed-by date.",
    kind: "read",
    input: {
      status: z.array(orderStatus).optional().describe("Only these statuses"),
      limit: z.number().int().min(1).max(500).default(50),
    },
    async run({ status, limit }, ctx) {
      const res = await listOrders(ctx.db());
      if (!res.ok) return res;
      const rows = status ? res.data.filter((o) => status.includes(o.status)) : res.data;
      return ok(rows.slice(0, limit));
    },
  }),

  defineTool({
    name: "get_order",
    title: "Get an order",
    description:
      "Full order: customer, delivery, items, RFQs with supplier quote lines, awards and documents. " +
      "All money is integer LKR cents.",
    kind: "read",
    input: { orderId: uuid("Order id") },
    async run({ orderId }, ctx) {
      return getOrder(ctx.db(), orderId);
    },
  }),

  defineTool({
    name: "create_order",
    title: "Create an order",
    description:
      "Record a customer order (usually from a WhatsApp chat) as a draft. " +
      "Returns the new order id and order number (FM-YYYY-NNNN).",
    kind: "write",
    input: {
      customerName: z.string().min(1),
      customerPhone: z.string().min(1),
      customerEmail: z.string().email().nullable().optional(),
      customerLocale: z.enum(["en", "si"]).default("en"),
      source: z.enum(ORDER_SOURCES).default("whatsapp"),
      deliveryAddress: z.string().nullable().optional(),
      deliveryDistrict: district.nullable().optional(),
      deliveryCity: z.string().nullable().optional(),
      neededByDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional()
        .describe("YYYY-MM-DD"),
      notesInternal: z.string().nullable().optional(),
      notesCustomer: z.string().nullable().optional(),
      items: z.array(orderItem).min(1),
    },
    async run(input, ctx) {
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      return createOrder(ctx.db(), input, admin.data.userId);
    },
  }),

  defineTool({
    name: "update_order_status",
    title: "Move an order to a new status",
    description:
      "Advance an order's lifecycle. Legal moves: draft→sourcing, sourcing→quoted, quoted→confirmed, " +
      "confirmed→invoiced, invoiced→paid, paid→fulfilling, fulfilling→completed, and any open status→cancelled. " +
      "Prefer the document tools for quoted/confirmed/invoiced/paid; use this for fulfilling, completed and cancelled.",
    kind: "write",
    input: { orderId: uuid("Order id"), to: orderStatus },
    async run({ orderId, to }, ctx) {
      return updateOrderStatus(ctx.db(), orderId, to);
    },
  }),

  defineTool({
    name: "match_suppliers",
    title: "Match suppliers for an order",
    description:
      "Verified supplier/farmer shops that could fill this order — candidates for send_rfqs.",
    kind: "read",
    input: { orderId: uuid("Order id") },
    async run({ orderId }, ctx) {
      return matchRoseGrowers(ctx.db(), orderId);
    },
  }),

  defineTool({
    name: "send_rfqs",
    title: "Send RFQs to suppliers",
    description:
      "Create requests-for-quote for the chosen suppliers (moves a draft order to 'sourcing') and, " +
      "unless notify=false, SEND each supplier a WhatsApp nudge linking to the RFQ. " +
      "Suppliers already RFQ'd on this order are skipped.",
    kind: "send",
    input: {
      orderId: uuid("Order id"),
      supplierShopIds: z.array(z.string().uuid()).min(1),
      message: z.string().optional().describe("Note shown to suppliers on the RFQ"),
      notify: z.boolean().default(true),
    },
    async run({ orderId, supplierShopIds, message, notify }, ctx) {
      const db = ctx.db();
      const created = await createRfqs(db, orderId, supplierShopIds, message);
      if (!created.ok) return created;
      const ids = created.data.created;
      if (!notify || ids.length === 0) return ok({ created: ids, dispatch: [] });

      const info = await resolveRfqDispatchInfo(db, ids, orderId);
      if (!info.ok) return ok({ created: ids, dispatch: [], dispatchError: info.message });
      const config = ctx.evolution();
      const url = portalUrl(ctx);
      const dispatch = await Promise.all(info.data.map((row) => nudgeSupplier(db, config, url, row)));
      return ok({ created: ids, dispatch });
    },
  }),

  defineTool({
    name: "resend_rfq_nudge",
    title: "Re-send an RFQ WhatsApp nudge",
    description: "SEND the RFQ WhatsApp reminder again (e.g. the first send failed or the supplier hasn't replied).",
    kind: "send",
    input: { orderId: uuid("Order id"), rfqId: uuid("RFQ id") },
    async run({ orderId, rfqId }, ctx) {
      const db = ctx.db();
      const info = await resolveRfqDispatchInfo(db, [rfqId], orderId);
      if (!info.ok) return info;
      const row = info.data[0];
      if (!row) return err("not_found", "RFQ not found on this order.");
      return ok(await nudgeSupplier(db, ctx.evolution(), portalUrl(ctx), row));
    },
  }),

  defineTool({
    name: "create_award",
    title: "Award an order line to a supplier",
    description:
      "Allocate some or all of an order item's quantity to a supplier at a unit cost. " +
      "Split a line across suppliers with several awards. Link rfqQuoteLineId when awarding a quote.",
    kind: "write",
    input: {
      orderItemId: uuid("Order item id"),
      supplierShopId: uuid("Supplier shop id"),
      rfqQuoteLineId: z.string().uuid().nullable().optional(),
      awardedQty: z.number().int().positive(),
      unitCost: cents("Supplier unit cost"),
      notes: z.string().nullable().optional(),
    },
    async run(input, ctx) {
      return createAward(ctx.db(), {
        ...input,
        rfqQuoteLineId: input.rfqQuoteLineId ?? null,
        notes: input.notes ?? null,
      });
    },
  }),

  defineTool({
    name: "cancel_award",
    title: "Cancel an award",
    description: "Cancel a supplier award, freeing its quantity to be re-awarded.",
    kind: "write",
    input: { awardId: uuid("Award id") },
    async run({ awardId }, ctx) {
      return cancelAward(ctx.db(), awardId);
    },
  }),

  defineTool({
    name: "get_cost_rollup",
    title: "Order cost roll-up",
    description: "Per-item awarded quantity and supplier cost (LKR cents) — the basis for customer pricing.",
    kind: "read",
    input: { orderId: uuid("Order id") },
    async run({ orderId }, ctx) {
      return orderCostRollup(ctx.db(), orderId);
    },
  }),

  defineTool({
    name: "create_document_draft",
    title: "Draft a quotation, invoice or receipt",
    description:
      "Build a draft customer document from the order's awards. Customer price = cost + margin " +
      "(default 2500 bps = 25%) unless a per-line override is given. An invoice needs an accepted " +
      "quotation; a receipt needs a paid invoice. Drafts are not visible to the customer until issued.",
    kind: "write",
    input: {
      orderId: uuid("Order id"),
      type: documentType,
      marginBps: z.number().int().min(0).max(20000).optional().describe("Margin in basis points"),
      discount: cents("Discount").optional(),
      deliveryFee: cents("Delivery fee").optional(),
      lineOverrides: z
        .record(z.string().uuid(), z.number().int().nonnegative())
        .optional()
        .describe("orderItemId → customer unit price in LKR cents"),
      notes: z.string().nullable().optional(),
    },
    async run(input, ctx) {
      const admin = await ctx.actingAdmin();
      if (!admin.ok) return admin;
      return buildDocumentDraft(ctx.db(), input.orderId, input.type, {
        marginBps: input.marginBps,
        discount: input.discount,
        deliveryFee: input.deliveryFee,
        linePriceOverrides: input.lineOverrides,
        notes: input.notes ?? null,
        createdByUserId: admin.data.userId,
      });
    },
  }),

  defineTool({
    name: "issue_document",
    title: "Issue a document",
    description:
      "Finalise a draft (becomes immutable, gets a doc number and public link). Issuing a quotation " +
      "moves the order to 'quoted'; an invoice moves it to 'invoiced'. Does not message the customer — " +
      "use send_document_link for that.",
    kind: "write",
    input: { orderId: uuid("Order id"), docId: uuid("Draft document id"), type: documentType },
    async run({ orderId, docId, type }, ctx) {
      const db = ctx.db();
      const issued = await issueDocument(db, docId);
      if (!issued.ok) return issued;
      const next = type === "quotation" ? "quoted" : type === "invoice" ? "invoiced" : null;
      const status = next ? await updateOrderStatus(db, orderId, next) : null;
      return ok({
        ...issued.data,
        ...(status && !status.ok ? { orderStatusWarning: status.message } : {}),
      });
    },
  }),

  defineTool({
    name: "accept_quotation",
    title: "Mark a quotation accepted",
    description: "Record that the customer accepted an issued quotation; moves the order to 'confirmed'.",
    kind: "write",
    input: { orderId: uuid("Order id"), docId: uuid("Quotation document id") },
    async run({ orderId, docId }, ctx) {
      const db = ctx.db();
      const res = await acceptDocument(db, docId);
      if (!res.ok) return res;
      const status = await updateOrderStatus(db, orderId, "confirmed");
      return ok(status.ok ? { accepted: true } : { accepted: true, orderStatusWarning: status.message });
    },
  }),

  defineTool({
    name: "mark_invoice_paid",
    title: "Mark an invoice paid",
    description: "Record a customer payment against an issued invoice; moves the order to 'paid'.",
    kind: "write",
    input: {
      orderId: uuid("Order id"),
      docId: uuid("Invoice document id"),
      method: z.string().min(1).describe("e.g. bank transfer, cash, card"),
      ref: z.string().min(1).describe("Bank/payment reference"),
    },
    async run({ orderId, docId, method, ref }, ctx) {
      const db = ctx.db();
      const res = await markPaid(db, docId, method, ref);
      if (!res.ok) return res;
      const status = await updateOrderStatus(db, orderId, "paid");
      return ok(status.ok ? { paid: true } : { paid: true, orderStatusWarning: status.message });
    },
  }),

  defineTool({
    name: "send_document_link",
    title: "WhatsApp a document link to the customer",
    description:
      "SEND the customer a WhatsApp message with the OTP-protected link to an issued quotation, " +
      "invoice or receipt, in their preferred language.",
    kind: "send",
    input: { orderId: uuid("Order id"), docId: uuid("Issued document id") },
    async run({ orderId, docId }, ctx) {
      const db = ctx.db();
      const order = await getOrder(db, orderId);
      if (!order.ok) return order;
      const doc = order.data.documents.find((d) => d.id === docId);
      if (!doc) return err("not_found", "Document not found on this order.");
      if (doc.status === "draft" || doc.status === "void") {
        return err("validation", `Document is ${doc.status}; issue it first.`);
      }
      const type = documentType.safeParse(doc.type);
      if (!type.success) return err("validation", `Unknown document type ${doc.type}.`);

      const webUrl = (ctx.env().WEB_PUBLIC_URL ?? "").replace(/\/$/, "");
      if (!webUrl) return err("db_unavailable", "WEB_PUBLIC_URL is not configured.");
      const locale = order.data.customerLocale === "si" ? "si" : "en";
      const url = `${webUrl}/${locale}/d/${doc.publicToken}`;
      const message = buildDocumentLinkMessage({ type: type.data, docNo: doc.docNo, url, locale });

      const phone = order.data.customerPhone;
      const res = await sendAndLog(db, ctx.evolution(), phone, message);
      if (!res.ok) return err("unknown", `WhatsApp send failed: ${res.message}`);
      return ok({ sent: true, phone, url });
    },
  }),
];
