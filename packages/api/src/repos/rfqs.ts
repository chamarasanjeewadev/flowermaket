/**
 * RFQs repo — grower matching + supplier-scoped reads + tenant guard.
 *
 * Conventions match repos/products.ts and repos/shops.ts:
 * - `db`-first arg (`DbOrTx` alias), accepts live client or open transaction.
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure guard (`assertOwnsRfq`) is exported separately for unit testing
 *   without a database (see rfqs.test.ts).
 *
 * Scope: matching + reads only. createRfq / recordSupplierQuote /
 * markRfqViewed are Task 9.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, type ActionResult } from "../errors";

// ---------------------------------------------------------------------------
// DbOrTx — live client or an open transaction
// ---------------------------------------------------------------------------

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchedSupplier {
  shopId: string;
  nameEn: string;
  district: string;
}

export interface SupplierRfqSummary {
  id: string;
  orderId: string;
  orderNo: string;
  status: string;
  sentAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  /** A brief label derived from the first item's descriptionEn. */
  firstItemDescription: string | null;
  itemCount: number;
}

export interface SupplierRfqOrderItem {
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

export interface SupplierRfqQuoteLine {
  id: string;
  orderItemId: string;
  availableQty: number;
  unitPrice: number;
  leadTimeDays: number | null;
  notes: string | null;
}

export interface SupplierRfqDetail {
  id: string;
  orderId: string;
  orderNo: string;
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
  items: SupplierRfqOrderItem[];
  quoteLines: SupplierRfqQuoteLine[];
}

// ---------------------------------------------------------------------------
// Pure tenant guard (exported for unit testing without a database)
// ---------------------------------------------------------------------------

/**
 * Cross-tenant guard: a supplier must not read/answer another shop's RFQ.
 * Pass any object that has `supplierShopId` (i.e. a row fetched from `rfqs`).
 * Returns ok(true) when the shopId matches, err("not_found", …) otherwise so
 * the caller cannot distinguish "does not exist" from "belongs to another shop".
 */
export function assertOwnsRfq(
  rfq: { supplierShopId: string },
  shopId: string,
): ActionResult<true> {
  if (rfq.supplierShopId !== shopId) {
    return err("not_found", "RFQ not found.");
  }
  return ok(true as const);
}

// ---------------------------------------------------------------------------
// matchRoseGrowers — Task 8 Review Focus
// ---------------------------------------------------------------------------

/**
 * Find distinct active growers that stock at least one active product in any
 * of the order's item categories.
 *
 * Returns ok([]) when the order has no items with a categoryId (nothing to
 * match against). Returns err("not_found") when the order itself doesn't exist
 * and has no items, though in practice callers already hold the order context.
 */
export async function matchRoseGrowers(
  db: DbOrTx,
  orderId: string,
): Promise<ActionResult<MatchedSupplier[]>> {
  try {
    // 1. Gather the order's item categoryIds
    const items = await db
      .select({ categoryId: schema.orderItems.categoryId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));

    const catIds = items
      .map((i) => i.categoryId)
      .filter((c): c is string => !!c);

    if (!catIds.length) return ok([]);

    // 2. Distinct growers with an active product in those categories
    const rows = await db
      .selectDistinct({
        shopId: schema.shops.id,
        nameEn: schema.shops.nameEn,
        district: schema.shops.district,
      })
      .from(schema.shops)
      .innerJoin(
        schema.products,
        eq(schema.products.shopId, schema.shops.id),
      )
      .where(
        and(
          eq(schema.shops.shopType, "grower"),
          eq(schema.shops.isActive, true),
          eq(schema.products.status, "active"),
          inArray(schema.products.categoryId, catIds),
        ),
      );

    return ok(rows);
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Failed to match growers.");
  }
}

// ---------------------------------------------------------------------------
// listSupplierRfqs
// ---------------------------------------------------------------------------

/**
 * All RFQs addressed to `shopId`, newest first.
 * Joins `orders` to surface the human-readable `orderNo` and a brief item
 * summary (first item description + total item count) for list views.
 */
export async function listSupplierRfqs(
  db: DbOrTx,
  shopId: string,
): Promise<ActionResult<SupplierRfqSummary[]>> {
  try {
    // Fetch RFQ rows joined to their orders
    const rfqRows = await db
      .select({
        id: schema.rfqs.id,
        orderId: schema.rfqs.orderId,
        orderNo: schema.orders.orderNo,
        status: schema.rfqs.status,
        sentAt: schema.rfqs.sentAt,
        expiresAt: schema.rfqs.expiresAt,
        createdAt: schema.rfqs.createdAt,
      })
      .from(schema.rfqs)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.rfqs.orderId))
      .where(eq(schema.rfqs.supplierShopId, shopId))
      .orderBy(asc(schema.rfqs.sentAt));

    if (!rfqRows.length) return ok([]);

    // Fetch items for all those orders in a single query
    const orderIds = [...new Set(rfqRows.map((r) => r.orderId))];
    const itemRows = await db
      .select({
        orderId: schema.orderItems.orderId,
        descriptionEn: schema.orderItems.descriptionEn,
        sortOrder: schema.orderItems.sortOrder,
      })
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, orderIds))
      .orderBy(asc(schema.orderItems.sortOrder));

    // Group by orderId
    const itemsByOrder = new Map<
      string,
      { descriptionEn: string; sortOrder: number }[]
    >();
    for (const it of itemRows) {
      const list = itemsByOrder.get(it.orderId) ?? [];
      list.push({ descriptionEn: it.descriptionEn, sortOrder: it.sortOrder });
      itemsByOrder.set(it.orderId, list);
    }

    const summaries: SupplierRfqSummary[] = rfqRows.map((r) => {
      const orderItems = itemsByOrder.get(r.orderId) ?? [];
      const sorted = orderItems.sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        id: r.id,
        orderId: r.orderId,
        orderNo: r.orderNo,
        status: r.status,
        sentAt: r.sentAt,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        firstItemDescription: sorted[0]?.descriptionEn ?? null,
        itemCount: orderItems.length,
      };
    });

    return ok(summaries);
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Failed to list RFQs.");
  }
}

// ---------------------------------------------------------------------------
// getSupplierRfq
// ---------------------------------------------------------------------------

/**
 * Fetch a single RFQ for a supplier, with its order's items and any existing
 * quote lines. Returns err("not_found") when the RFQ doesn't exist OR its
 * supplierShopId !== shopId (tenant guard via assertOwnsRfq).
 */
export async function getSupplierRfq(
  db: DbOrTx,
  rfqId: string,
  shopId: string,
): Promise<ActionResult<SupplierRfqDetail>> {
  try {
    // 1. Fetch the RFQ row + its order's orderNo
    const [rfqRow] = await db
      .select({
        id: schema.rfqs.id,
        orderId: schema.rfqs.orderId,
        orderNo: schema.orders.orderNo,
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
      .innerJoin(schema.orders, eq(schema.orders.id, schema.rfqs.orderId))
      .where(eq(schema.rfqs.id, rfqId))
      .limit(1);

    if (!rfqRow) return err("not_found", "RFQ not found.");

    // 2. Tenant guard — silently treat wrong-owner as not found
    const guard = assertOwnsRfq(rfqRow, shopId);
    if (!guard.ok) return guard;

    // 3. Order items (all items for this order, sorted)
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
      .where(eq(schema.orderItems.orderId, rfqRow.orderId))
      .orderBy(asc(schema.orderItems.sortOrder));

    // 4. Existing quote lines for this RFQ
    const quoteLines = await db
      .select({
        id: schema.rfqQuoteLines.id,
        orderItemId: schema.rfqQuoteLines.orderItemId,
        availableQty: schema.rfqQuoteLines.availableQty,
        unitPrice: schema.rfqQuoteLines.unitPrice,
        leadTimeDays: schema.rfqQuoteLines.leadTimeDays,
        notes: schema.rfqQuoteLines.notes,
      })
      .from(schema.rfqQuoteLines)
      .where(eq(schema.rfqQuoteLines.rfqId, rfqId))
      .orderBy(asc(schema.rfqQuoteLines.id));

    return ok({
      id: rfqRow.id,
      orderId: rfqRow.orderId,
      orderNo: rfqRow.orderNo,
      supplierShopId: rfqRow.supplierShopId,
      status: rfqRow.status,
      message: rfqRow.message,
      quoteNotes: rfqRow.quoteNotes,
      quoteValidUntil: rfqRow.quoteValidUntil,
      sentAt: rfqRow.sentAt,
      viewedAt: rfqRow.viewedAt,
      respondedAt: rfqRow.respondedAt,
      expiresAt: rfqRow.expiresAt,
      createdAt: rfqRow.createdAt,
      updatedAt: rfqRow.updatedAt,
      items,
      quoteLines,
    });
  } catch (e) {
    return err("unknown", e instanceof Error ? e.message : "Failed to fetch RFQ.");
  }
}
