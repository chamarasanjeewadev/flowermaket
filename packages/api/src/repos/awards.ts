/**
 * Awards repo — per-line allocation with over-allocation invariant + cost rollup.
 *
 * Conventions match repos/products.ts, repos/orders.ts, repos/rfqs.ts:
 * - `db`-first arg, `DbOrTx` alias so callers compose transactions.
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure helpers (`remainingQty`, `validateAward`) are exported separately so
 *   they are unit-testable without a database (see awards.test.ts).
 *
 * Over-allocation invariant: `createAward` re-reads the item's quantity and all
 * non-cancelled awards INSIDE the transaction, then re-validates via
 * `validateAward` before inserting. This defends against concurrent requests
 * that each individually pass a pre-tx check.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, isPgError, ok, type ActionResult } from "../errors";
import type { ValidationError } from "./shops";

// ---------------------------------------------------------------------------
// DbOrTx — live client or an open transaction
// ---------------------------------------------------------------------------

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Award status type
// ---------------------------------------------------------------------------

export type AwardStatus = "pending" | "confirmed" | "cancelled";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface CreateAwardInput {
  orderItemId: string;
  supplierShopId: string;
  rfqQuoteLineId?: string | null;
  awardedQty: number;
  /** Unit cost in LKR cents. */
  unitCost: number;
  notes?: string | null;
}

export interface AwardCostRollupRow {
  itemId: string;
  awardedQty: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no DB dependency)
// ---------------------------------------------------------------------------

/**
 * Returns how many units of an order item are still available to award.
 * Cancelled awards are excluded from the consumed count.
 */
export function remainingQty(
  itemQty: number,
  existingAwards: { awardedQty: number; status: string }[],
): number {
  const consumed = existingAwards
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + a.awardedQty, 0);
  return itemQty - consumed;
}

/**
 * Validates that `newQty` can be awarded against an item without exceeding the
 * remaining capacity.
 *
 * Rules:
 *  1. `newQty` must be a positive integer.
 *  2. `newQty` must not exceed `remainingQty(itemQty, existingAwards)`.
 *
 * Returns an empty array when valid; otherwise returns one or more
 * `ValidationError` objects describing the problem(s).
 */
export function validateAward(
  itemQty: number,
  existingAwards: { awardedQty: number; status: string }[],
  newQty: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Number.isInteger(newQty) || newQty <= 0) {
    errors.push({
      field: "awardedQty",
      message: "Awarded quantity must be a positive whole number.",
    });
    // No point checking remaining if qty itself is invalid.
    return errors;
  }

  const remaining = remainingQty(itemQty, existingAwards);
  if (newQty > remaining) {
    errors.push({
      field: "awardedQty",
      message: `Awarded quantity (${newQty}) exceeds the remaining item quantity (${remaining}).`,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Repo mutations
// ---------------------------------------------------------------------------

/**
 * Create an award for an order item line.
 *
 * The over-allocation invariant is enforced by re-reading the item's quantity
 * and all non-cancelled existing awards inside the transaction before
 * inserting. This prevents concurrent requests from each individually
 * passing a pre-tx validation check and collectively over-allocating.
 */
export async function createAward(
  db: Db,
  input: CreateAwardInput,
): Promise<ActionResult<{ id: string }>> {
  // Pre-validate the shape of the input before opening a tx.
  if (!input.orderItemId) return err("validation", "orderItemId is required.");
  if (!input.supplierShopId) return err("validation", "supplierShopId is required.");
  if (!Number.isInteger(input.unitCost) || input.unitCost <= 0) {
    return err("validation", "Unit cost must be a positive whole number (LKR cents).");
  }

  try {
    return await db.transaction(async (tx) => {
      // Re-read the item's quantity inside the tx and take a row lock
      // (`FOR UPDATE`) so concurrent allocations on the SAME item serialize.
      // Without the lock, under read-committed two concurrent inserts could
      // each pass validation and collectively over-allocate.
      const [item] = await tx
        .select({ quantity: schema.orderItems.quantity })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.id, input.orderItemId))
        .for("update")
        .limit(1);

      if (!item) {
        return err("not_found", "Order item not found.");
      }

      // Re-read all non-cancelled awards for this item inside the tx.
      const existingAwards = await tx
        .select({
          awardedQty: schema.orderItemAwards.awardedQty,
          status: schema.orderItemAwards.status,
        })
        .from(schema.orderItemAwards)
        .where(
          and(
            eq(schema.orderItemAwards.orderItemId, input.orderItemId),
            ne(schema.orderItemAwards.status, "cancelled"),
          ),
        );

      // Re-validate inside the tx (defense against concurrent races).
      const errors = validateAward(item.quantity, existingAwards, input.awardedQty);
      if (errors.length > 0) {
        return err("validation", errors.map((e) => e.message).join(" "));
      }

      const [row] = await tx
        .insert(schema.orderItemAwards)
        .values({
          orderItemId: input.orderItemId,
          supplierShopId: input.supplierShopId,
          rfqQuoteLineId: input.rfqQuoteLineId ?? null,
          awardedQty: input.awardedQty,
          unitCost: input.unitCost,
          notes: input.notes ?? null,
        })
        .returning({ id: schema.orderItemAwards.id });

      return ok({ id: row.id });
    });
  } catch (e) {
    if (isPgError(e, "23503")) {
      return err(
        "validation",
        "Referenced order item, shop, or quote line does not exist.",
      );
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not create award.",
    );
  }
}

/**
 * Cancel an award by setting its status to 'cancelled'.
 * Returns void on success; not_found if the award doesn't exist.
 */
export async function cancelAward(
  db: DbOrTx,
  awardId: string,
): Promise<ActionResult<void>> {
  try {
    const [row] = await db
      .update(schema.orderItemAwards)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(schema.orderItemAwards.id, awardId))
      .returning({ id: schema.orderItemAwards.id });

    if (!row) {
      return err("not_found", "Award not found.");
    }

    return ok(undefined);
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not cancel award.",
    );
  }
}

/**
 * Aggregate all non-cancelled awards for every item in an order.
 *
 * Returns one row per order item that has at least one non-cancelled award,
 * with:
 *   - `awardedQty`: sum of `awarded_qty` across non-cancelled awards.
 *   - `cost`: sum of `awarded_qty * unit_cost` across non-cancelled awards
 *             (total cost for that item in LKR cents).
 */
export async function orderCostRollup(
  db: DbOrTx,
  orderId: string,
): Promise<ActionResult<AwardCostRollupRow[]>> {
  try {
    const rows = await db
      .select({
        itemId: schema.orderItemAwards.orderItemId,
        awardedQty: sql<number>`cast(sum(${schema.orderItemAwards.awardedQty}) as integer)`,
        cost: sql<number>`cast(sum(${schema.orderItemAwards.awardedQty} * ${schema.orderItemAwards.unitCost}) as integer)`,
      })
      .from(schema.orderItemAwards)
      .innerJoin(
        schema.orderItems,
        eq(schema.orderItems.id, schema.orderItemAwards.orderItemId),
      )
      .where(
        and(
          eq(schema.orderItems.orderId, orderId),
          ne(schema.orderItemAwards.status, "cancelled"),
        ),
      )
      .groupBy(schema.orderItemAwards.orderItemId);

    return ok(
      rows.map((r) => ({
        itemId: r.itemId,
        awardedQty: r.awardedQty,
        cost: r.cost,
      })),
    );
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not compute order cost rollup.",
    );
  }
}
