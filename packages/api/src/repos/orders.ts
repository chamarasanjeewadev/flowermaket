/**
 * Orders repo — create, status-transition guard, aggregate reads.
 *
 * Conventions match repos/products.ts and repos/shops.ts:
 * - `db`-first arg, accepts `DbOrTx` so callers compose transactions.
 * - Every mutation returns `ActionResult<T>` — no throws from business logic.
 * - Pure helpers (`nextOrderNo`, `canTransition`) are exported for unit tests.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, isPgError, ok, type ActionResult } from "../errors";
import { DISTRICTS, ORDER_UNITS } from "../constants";
import type { ValidationError } from "./shops";

// ---------------------------------------------------------------------------
// DbOrTx — live client or an open transaction
// ---------------------------------------------------------------------------

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Input types (from Task 5)
// ---------------------------------------------------------------------------

export interface OrderItemInput {
  categoryId?: string | null;
  descriptionEn: string;
  descriptionSi?: string | null;
  variant?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerLocale?: "en" | "si";
  deliveryAddress?: string | null;
  deliveryDistrict?: string | null;
  deliveryCity?: string | null;
  neededByDate?: string | null;
  notesInternal?: string | null;
  notesCustomer?: string | null;
  items?: OrderItemInput[];
}

// ---------------------------------------------------------------------------
// Pure validators (Task 5 — unchanged)
// ---------------------------------------------------------------------------

export function validateOrderItemInput(item: OrderItemInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!item.descriptionEn?.trim()) errors.push({ field: "descriptionEn", message: "Description is required" });
  if (!Number.isInteger(item.quantity) || item.quantity <= 0)
    errors.push({ field: "quantity", message: "Quantity must be a positive whole number" });
  if (!ORDER_UNITS.includes(item.unit as (typeof ORDER_UNITS)[number]))
    errors.push({ field: "unit", message: "Unknown unit" });
  return errors;
}

export function validateCreateOrderInput(input: CreateOrderInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!input.customerName?.trim()) errors.push({ field: "customerName", message: "Customer name is required" });
  const digits = (input.customerPhone ?? "").replace(/\D/g, "");
  if (digits.length < 9) errors.push({ field: "customerPhone", message: "A valid phone number is required" });
  if (input.deliveryDistrict && !DISTRICTS.some((d) => d.slug === input.deliveryDistrict))
    errors.push({ field: "deliveryDistrict", message: "Unknown district" });
  (input.items ?? []).forEach((it, i) => {
    for (const e of validateOrderItemInput(it)) errors.push({ field: `items.${i}.${e.field}`, message: e.message });
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Status types + transition map
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "draft"
  | "sourcing"
  | "quoted"
  | "confirmed"
  | "invoiced"
  | "paid"
  | "fulfilling"
  | "completed"
  | "cancelled";

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  draft:      ["sourcing", "cancelled"],
  sourcing:   ["quoted", "cancelled"],
  quoted:     ["confirmed", "cancelled"],
  confirmed:  ["invoiced", "cancelled"],
  invoiced:   ["paid", "cancelled"],
  paid:       ["fulfilling", "cancelled"],
  fulfilling: ["completed", "cancelled"],
  completed:  [],
  cancelled:  [],
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Format an order number from year + sequence.
 * e.g. nextOrderNo(2026, 1) === "FM-2026-0001"
 */
export function nextOrderNo(year: number, seq: number): string {
  return `FM-${year}-${seq.toString().padStart(4, "0")}`;
}

/** True when transitioning from `from` to `to` is permitted by NEXT. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Aggregate read types
// ---------------------------------------------------------------------------

export interface OrderItemDetail {
  id: string;
  categoryId: string | null;
  descriptionEn: string;
  descriptionSi: string | null;
  variant: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
  sortOrder: number;
}

export interface RfqQuoteLineDetail {
  id: string;
  orderItemId: string;
  availableQty: number;
  unitPrice: number;
  leadTimeDays: number | null;
  notes: string | null;
}

export interface RfqDetail {
  id: string;
  supplierShopId: string;
  status: string;
  message: string | null;
  quoteNotes: string | null;
  quoteValidUntil: Date | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  quoteLines: RfqQuoteLineDetail[];
}

export interface OrderItemAwardDetail {
  id: string;
  orderItemId: string;
  supplierShopId: string;
  rfqQuoteLineId: string | null;
  awardedQty: number;
  unitCost: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderDocumentDetail {
  id: string;
  type: string;
  docNo: string;
  status: string;
  total: number;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderDetail {
  id: string;
  orderNo: string;
  source: string;
  buyerUserId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerLocale: string;
  deliveryAddress: string | null;
  deliveryDistrict: string | null;
  deliveryCity: string | null;
  neededByDate: string | null;
  notesInternal: string | null;
  notesCustomer: string | null;
  status: OrderStatus;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemDetail[];
  rfqs: RfqDetail[];
  awards: OrderItemAwardDetail[];
  documents: OrderDocumentDetail[];
}

export interface OrderSummary {
  id: string;
  orderNo: string;
  customerName: string;
  status: OrderStatus;
  createdAt: Date;
  neededByDate: string | null;
}

// ---------------------------------------------------------------------------
// DB functions
// ---------------------------------------------------------------------------

/**
 * Create an order with its items inside a transaction.
 * Derives the year-sequence via COUNT, formats the order number, inserts the
 * order row and then the item rows. Returns `{ id, orderNo }` on success.
 * Returns `err("conflict", …)` on order-number collision (23505), which the
 * caller should retry.
 */
export async function createOrder(
  db: DbOrTx,
  input: CreateOrderInput,
  createdByUserId: string,
): Promise<ActionResult<{ id: string; orderNo: string }>> {
  const errors = validateCreateOrderInput(input);
  if (errors.length) {
    return err("validation", errors.map((e) => `${e.field}: ${e.message}`).join("; "));
  }

  try {
    return await (db as Db).transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      // Count existing orders this year to derive the next sequence number.
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(sql`extract(year from ${schema.orders.createdAt}) = ${year}`);
      const orderNo = nextOrderNo(year, Number(count) + 1);

      const [row] = await tx
        .insert(schema.orders)
        .values({
          orderNo,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone.trim(),
          customerEmail: input.customerEmail ?? null,
          customerLocale: input.customerLocale ?? "en",
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryDistrict: input.deliveryDistrict ?? null,
          deliveryCity: input.deliveryCity ?? null,
          neededByDate: input.neededByDate ?? null,
          notesInternal: input.notesInternal ?? null,
          notesCustomer: input.notesCustomer ?? null,
          createdByUserId,
        })
        .returning({ id: schema.orders.id });

      if (input.items?.length) {
        await tx.insert(schema.orderItems).values(
          input.items.map((it, i) => ({
            orderId: row.id,
            categoryId: it.categoryId ?? null,
            descriptionEn: it.descriptionEn.trim(),
            descriptionSi: it.descriptionSi ?? null,
            variant: it.variant ?? null,
            quantity: it.quantity,
            unit: it.unit,
            notes: it.notes ?? null,
            sortOrder: i,
          })),
        );
      }

      return ok({ id: row.id, orderNo });
    });
  } catch (e) {
    if (isPgError(e, "23505")) return err("conflict", "Order number collision, retry");
    return err("unknown", "Failed to create order");
  }
}

/**
 * Transition an order's status, enforcing the NEXT guard.
 * Reads the current status first; returns `err("not_found")` if the order
 * doesn't exist, or `err("validation")` for an illegal transition.
 */
export async function updateOrderStatus(
  db: DbOrTx,
  orderId: string,
  to: OrderStatus,
): Promise<ActionResult<void>> {
  const [current] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId));

  if (!current) return err("not_found", "Order not found");

  if (!canTransition(current.status as OrderStatus, to)) {
    return err("validation", `Illegal transition ${current.status} -> ${to}`);
  }

  await db
    .update(schema.orders)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(schema.orders.id, orderId));

  return ok(undefined);
}

/**
 * Fetch a full order aggregate:
 * order row + items + rfqs (with quote lines) + awards + documents.
 * Returns `err("not_found")` when the order doesn't exist.
 */
export async function getOrder(
  db: Db,
  orderId: string,
): Promise<ActionResult<OrderDetail>> {
  // 1. Order row
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);

  if (!order) return err("not_found", "Order not found");

  // 2. Items
  const items = await db
    .select({
      id: schema.orderItems.id,
      categoryId: schema.orderItems.categoryId,
      descriptionEn: schema.orderItems.descriptionEn,
      descriptionSi: schema.orderItems.descriptionSi,
      variant: schema.orderItems.variant,
      quantity: schema.orderItems.quantity,
      unit: schema.orderItems.unit,
      notes: schema.orderItems.notes,
      sortOrder: schema.orderItems.sortOrder,
    })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId))
    .orderBy(asc(schema.orderItems.sortOrder));

  // 3. RFQs
  const rfqRows = await db
    .select({
      id: schema.rfqs.id,
      supplierShopId: schema.rfqs.supplierShopId,
      status: schema.rfqs.status,
      message: schema.rfqs.message,
      quoteNotes: schema.rfqs.quoteNotes,
      quoteValidUntil: schema.rfqs.quoteValidUntil,
      sentAt: schema.rfqs.sentAt,
      viewedAt: schema.rfqs.viewedAt,
      respondedAt: schema.rfqs.respondedAt,
      expiresAt: schema.rfqs.expiresAt,
      createdAt: schema.rfqs.createdAt,
      updatedAt: schema.rfqs.updatedAt,
    })
    .from(schema.rfqs)
    .where(eq(schema.rfqs.orderId, orderId))
    .orderBy(asc(schema.rfqs.createdAt));

  // 4. Quote lines (for all RFQs in one query)
  const rfqIds = rfqRows.map((r) => r.id);
  const quoteLineRows =
    rfqIds.length > 0
      ? await db
          .select({
            id: schema.rfqQuoteLines.id,
            rfqId: schema.rfqQuoteLines.rfqId,
            orderItemId: schema.rfqQuoteLines.orderItemId,
            availableQty: schema.rfqQuoteLines.availableQty,
            unitPrice: schema.rfqQuoteLines.unitPrice,
            leadTimeDays: schema.rfqQuoteLines.leadTimeDays,
            notes: schema.rfqQuoteLines.notes,
          })
          .from(schema.rfqQuoteLines)
          .where(inArray(schema.rfqQuoteLines.rfqId, rfqIds))
          .orderBy(asc(schema.rfqQuoteLines.id))
      : [];

  // Group quote lines by rfqId
  const quoteLinesByRfq = new Map<string, RfqQuoteLineDetail[]>();
  for (const ql of quoteLineRows) {
    const list = quoteLinesByRfq.get(ql.rfqId) ?? [];
    list.push({
      id: ql.id,
      orderItemId: ql.orderItemId,
      availableQty: ql.availableQty,
      unitPrice: ql.unitPrice,
      leadTimeDays: ql.leadTimeDays,
      notes: ql.notes,
    });
    quoteLinesByRfq.set(ql.rfqId, list);
  }

  const rfqs: RfqDetail[] = rfqRows.map((r) => ({
    ...r,
    quoteLines: quoteLinesByRfq.get(r.id) ?? [],
  }));

  // 5. Awards — filter by items belonging to this order
  const itemIds = items.map((it) => it.id);
  const awards: OrderItemAwardDetail[] =
    itemIds.length > 0
      ? await db
          .select({
            id: schema.orderItemAwards.id,
            orderItemId: schema.orderItemAwards.orderItemId,
            supplierShopId: schema.orderItemAwards.supplierShopId,
            rfqQuoteLineId: schema.orderItemAwards.rfqQuoteLineId,
            awardedQty: schema.orderItemAwards.awardedQty,
            unitCost: schema.orderItemAwards.unitCost,
            status: schema.orderItemAwards.status,
            notes: schema.orderItemAwards.notes,
            createdAt: schema.orderItemAwards.createdAt,
            updatedAt: schema.orderItemAwards.updatedAt,
          })
          .from(schema.orderItemAwards)
          .where(inArray(schema.orderItemAwards.orderItemId, itemIds))
          .orderBy(asc(schema.orderItemAwards.createdAt))
      : [];

  // 6. Documents
  const documents: OrderDocumentDetail[] = await db
    .select({
      id: schema.documents.id,
      type: schema.documents.type,
      docNo: schema.documents.docNo,
      status: schema.documents.status,
      total: schema.documents.total,
      issuedAt: schema.documents.issuedAt,
      createdAt: schema.documents.createdAt,
      updatedAt: schema.documents.updatedAt,
    })
    .from(schema.documents)
    .where(eq(schema.documents.orderId, orderId))
    .orderBy(asc(schema.documents.createdAt));

  return ok({
    id: order.id,
    orderNo: order.orderNo,
    source: order.source,
    buyerUserId: order.buyerUserId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerLocale: order.customerLocale,
    deliveryAddress: order.deliveryAddress,
    deliveryDistrict: order.deliveryDistrict,
    deliveryCity: order.deliveryCity,
    neededByDate: order.neededByDate,
    notesInternal: order.notesInternal,
    notesCustomer: order.notesCustomer,
    status: order.status as OrderStatus,
    createdByUserId: order.createdByUserId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items,
    rfqs,
    awards,
    documents,
  });
}

/**
 * List all orders, newest first.
 * Returns a slim summary for use in admin list views.
 */
export async function listOrders(
  db: Db,
): Promise<ActionResult<OrderSummary[]>> {
  const rows = await db
    .select({
      id: schema.orders.id,
      orderNo: schema.orders.orderNo,
      customerName: schema.orders.customerName,
      status: schema.orders.status,
      createdAt: schema.orders.createdAt,
      neededByDate: schema.orders.neededByDate,
    })
    .from(schema.orders)
    .orderBy(desc(schema.orders.createdAt));

  return ok(
    rows.map((r) => ({
      id: r.id,
      orderNo: r.orderNo,
      customerName: r.customerName,
      status: r.status as OrderStatus,
      createdAt: r.createdAt,
      neededByDate: r.neededByDate,
    })),
  );
}
