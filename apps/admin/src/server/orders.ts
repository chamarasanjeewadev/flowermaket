/**
 * Order server functions for the Admin Portal.
 *
 * Admin-guarded: every handler checks for an authenticated admin session
 * (or auth_disabled dev mode) before touching the DB. `requireDb()` throws
 * DataUnavailableError when DATABASE_URL is absent, which surfaces as a 500
 * rather than silently swallowing the call — appropriate for mutations.
 *
 * Follows the pattern of `apps/supplier/src/server/products.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  requireDb,
  tryCreateDb,
  createOrder,
  getOrder,
  listOrders,
  type ActionResult,
  type CreateOrderInput,
  type OrderDetail,
  type OrderSummary,
} from "@flowers/api";
import { resolveAdminSession } from "./session";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function authError<T>(): ActionResult<T> {
  return { ok: false, code: "auth_required", message: "Admin access required." };
}

/**
 * Returns the admin user's id for the current request.
 * - `auth_disabled` → returns a sentinel dev id (no DB user).
 * - `admin` session → returns the real user id.
 * - All other kinds → returns null (caller should return authError).
 */
async function resolveAdminUserId(): Promise<
  { ok: true; userId: string } | { ok: false }
> {
  const session = await resolveAdminSession();
  if (session.kind === "auth_disabled") {
    return { ok: true, userId: "00000000-0000-0000-0000-000000000000" };
  }
  if (session.kind === "admin") {
    return { ok: true, userId: session.userId };
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listOrdersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActionResult<OrderSummary[]>> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return authError();
    }
    const db = tryCreateDb();
    if (!db) {
      return { ok: true, data: [] };
    }
    return listOrders(db);
  },
);

export const getOrderFn = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data: orderId }): Promise<ActionResult<OrderDetail>> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return authError();
    }
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "unknown", message: "Database is not configured." };
    }
    return getOrder(db, orderId);
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createOrderFn = createServerFn({ method: "POST" })
  .validator((input: CreateOrderInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; orderNo: string }>> => {
      const resolved = await resolveAdminUserId();
      if (!resolved.ok) return authError();

      const db = requireDb();
      return createOrder(db, data, resolved.userId);
    },
  );
