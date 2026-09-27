/**
 * RFQ server functions for the Supplier Portal.
 *
 * Every call is shop-scoped: shopId is resolved from resolveSupplierSession()
 * and passed to the repo — never taken from the client payload.
 *
 * Ruling P2: imports the @flowers/api barrel here (server-only). The client
 * route (.tsx) uses only "@flowers/api/money" / type-only imports to avoid
 * the "Buffer is not defined" hydration crash.
 * Ruling P3: all server fns live in this file.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  requireDb,
  tryCreateDb,
  listSupplierRfqs,
  getSupplierRfq,
  recordSupplierQuote,
  markRfqViewed,
  declineRfq,
  type ActionResult,
  type SupplierRfqSummary,
  type SupplierRfqDetail,
  type SupplierQuoteLineInput,
} from "@flowers/api";
import { resolveSupplierSession, type SupplierSession } from "./session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The owner's shop id, or null when the session cannot act on a real shop. */
function shopIdOf(session: SupplierSession): string | null {
  return session.kind === "supplier" && session.shopId
    ? session.shopId
    : null;
}

function authError<T>(): ActionResult<T> {
  return { ok: false, code: "auth_required", message: "You must be signed in." };
}

// ---------------------------------------------------------------------------
// listRfqsFn — GET /rfqs inbox
// ---------------------------------------------------------------------------

export const listRfqsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupplierRfqSummary[]> => {
    const session = await resolveSupplierSession();
    const shopId = shopIdOf(session);
    if (!shopId) return [];
    const db = tryCreateDb();
    if (!db) return [];
    try {
      const result = await listSupplierRfqs(db, shopId);
      return result.ok ? result.data : [];
    } catch {
      return [];
    }
  },
);

// ---------------------------------------------------------------------------
// getRfqFn — GET /rfqs/:rfqId (also marks RFQ as viewed)
// ---------------------------------------------------------------------------

export const getRfqFn = createServerFn({ method: "GET" })
  .validator((rfqId: string) => rfqId)
  .handler(async ({ data: rfqId }): Promise<SupplierRfqDetail | null> => {
    const session = await resolveSupplierSession();
    const shopId = shopIdOf(session);
    if (!shopId) return null;
    const db = tryCreateDb();
    if (!db) return null;
    try {
      const result = await getSupplierRfq(db, rfqId, shopId);
      if (!result.ok) return null;

      // Best-effort mark as viewed — do not fail the page load if this errors
      try {
        await markRfqViewed(db, rfqId, shopId);
      } catch {
        // ignore
      }

      return result.data;
    } catch {
      return null;
    }
  });

// ---------------------------------------------------------------------------
// submitQuoteFn — POST: record the supplier's quote lines
// ---------------------------------------------------------------------------

export interface SubmitQuoteInput {
  rfqId: string;
  /** Quote lines — unitPrice in CENTS (conversion done in the route component). */
  lines: SupplierQuoteLineInput[];
  quoteNotes?: string | null;
  validUntil?: string | null; // ISO date string from <input type="date">
}

export const submitQuoteFn = createServerFn({ method: "POST" })
  .validator((input: SubmitQuoteInput) => input)
  .handler(async ({ data }): Promise<ActionResult<void>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return authError();
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: undefined };
    }
    const shopId = shopIdOf(session);
    if (!shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }
    const db = requireDb();
    const validUntilDate = data.validUntil ? new Date(data.validUntil) : null;
    return recordSupplierQuote(
      db,
      data.rfqId,
      shopId,
      data.lines,
      data.quoteNotes ?? null,
      validUntilDate,
    );
  });

// ---------------------------------------------------------------------------
// declineRfqFn — POST: decline the RFQ
// ---------------------------------------------------------------------------

export const declineRfqFn = createServerFn({ method: "POST" })
  .validator((rfqId: string) => rfqId)
  .handler(async ({ data: rfqId }): Promise<ActionResult<void>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return authError();
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: undefined };
    }
    const shopId = shopIdOf(session);
    if (!shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }
    const db = requireDb();
    return declineRfq(db, rfqId, shopId);
  });
