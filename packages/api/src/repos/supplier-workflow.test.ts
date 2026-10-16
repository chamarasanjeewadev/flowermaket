import { describe, expect, it } from "vitest";
import type { Db } from "../db";
import { confirmCustomerQuotation } from "./orders";
import { recordSupplierQuote } from "./rfqs";
import { claimOrderSupplierAlert, savePortalSettings, updateSupplierFulfilment } from "./supplier-portal";

// A query-chain fixture exercises transaction decisions without a live customer database.
// Integration behaviour (SQL/RLS and provider delivery) still requires a staging database.
type Query = Promise<unknown[]> & { from: (table: unknown) => Query; where: (condition: unknown) => Query; limit: (count: number) => Query; for: (mode: string) => Query; innerJoin: (table: unknown, condition: unknown) => Query; returning: (fields?: unknown) => Query; onConflictDoNothing: () => Query };
function query(rows: unknown[]): Query {
  const result = Object.assign(Promise.resolve(rows), {
    from: () => result, where: () => result, limit: () => result, for: () => result,
    innerJoin: () => result, returning: () => result, onConflictDoNothing: () => result,
  });
  return result;
}
function fixture(reads: unknown[][]) {
  const updates: unknown[] = []; const inserts: unknown[] = []; let deletes = 0;
  const connection = {
    select: () => query(reads.shift() ?? []),
    selectDistinct: () => query(reads.shift() ?? []),
    update: () => ({ set: (value: unknown) => { updates.push(value); return query([]); } }),
    insert: () => ({ values: (value: unknown) => { inserts.push(value); return query([]); } }),
    delete: () => { deletes++; return query([]); },
    transaction: async <T>(callback: (tx: Db) => Promise<T>): Promise<T> => callback(connection as unknown as Db),
  };
  return { db: connection as unknown as Db, updates, inserts, deletes: () => deletes };
}
const rfq = { id: "request", supplierShopId: "shop", orderId: "order", status: "sent", expiresAt: null };
const lines = [{ orderItemId: "item", availableQty: 10, unitPrice: 25000, leadTimeDays: 1, notes: null }];
const previous = { submittedAt: "2026-10-01T00:00:00Z", notes: "Original", validUntil: null, deliveryCost: 0, lines: [{ ...lines[0], unitPrice: 20000 }] };

describe("supplier quote workflow", () => {
  it("refuses another supplier before writing or reading quote items", async () => {
    const f = fixture([[rfq]]);
    expect((await recordSupplierQuote(f.db, "request", "other-shop", lines)).ok).toBe(false);
    expect(f.inserts).toEqual([]); expect(f.updates).toEqual([]); expect(f.deletes()).toBe(0);
  });
  it("refuses an expired request", async () => {
    const f = fixture([[{ ...rfq, expiresAt: new Date(0) }]]);
    expect((await recordSupplierQuote(f.db, "request", "shop", lines)).ok).toBe(false);
    expect(f.updates).toEqual([]);
  });
  it("refuses duplicate quote items and unsafe money", async () => {
    for (const invalid of [[...lines, ...lines], [{ ...lines[0], unitPrice: NaN }], [{ ...lines[0], availableQty: 1.5 }]]) {
      const f = fixture([[rfq]]);
      expect((await recordSupplierQuote(f.db, "request", "shop", invalid)).ok).toBe(false);
      expect(f.inserts).toEqual([]);
    }
  });
  it("refuses quoting after customer cancellation", async () => {
    const f = fixture([[rfq], [{ id: "item" }], [{ status: "cancelled" }]]);
    expect((await recordSupplierQuote(f.db, "request", "shop", lines)).ok).toBe(false);
    expect(f.deletes()).toBe(0);
  });
  it("preserves the old quote when submitting a revision", async () => {
    const f = fixture([[{ ...rfq, status: "quoted" }], [{ id: "item" }], [{ status: "sourcing" }], [{ quoteRevisions: [previous], status: "quoted" }]]);
    expect((await recordSupplierQuote(f.db, "request", "shop", lines, "Revised", null, 50000)).ok).toBe(true);
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0]).toMatchObject({ quoteDeliveryCost: 50000, quoteRevisions: [previous, { notes: "Revised", deliveryCost: 50000, lines }] });
    expect(f.inserts).toHaveLength(1);
  });
  it("makes a repeated identical submission a no-op", async () => {
    const latest = { ...previous, notes: "Same", lines };
    const f = fixture([[{ ...rfq, status: "quoted" }], [{ id: "item" }], [{ status: "sourcing" }], [{ quoteRevisions: [latest], status: "quoted" }]]);
    expect((await recordSupplierQuote(f.db, "request", "shop", lines, "Same")).ok).toBe(true);
    expect(f.deletes()).toBe(0); expect(f.inserts).toEqual([]); expect(f.updates).toEqual([]);
  });
});
describe("notification and fulfilment guards", () => {
  it("invalidates verification when a supplier changes the number", async () => {
    const f = fixture([[{ notificationPhone: "+94771234567", notificationConsentAt: new Date(), notificationVerifiedAt: new Date() }]]);
    expect((await savePortalSettings(f.db, "shop", { phone: "0777654321", consent: true, language: "en", areas: "Test area", delivery: true, collection: false, preparationDays: 1 })).ok).toBe(true);
    expect(f.updates[0]).toMatchObject({ notificationPhone: "+94777654321", notificationVerifiedAt: null });
  });
  it("does not claim an alert already sent", async () => {
    const f = fixture([[{ status: "sent" }]]);
    expect(await claimOrderSupplierAlert(f.db, "alert", "order")).toBeNull(); expect(f.updates).toEqual([]);
  });
  it("refuses alerts when consent was withdrawn", async () => {
    const f = fixture([[{ status: "pending", shopId: "shop", orderId: "order", eventKey: "order:confirmed", phone: "+94771234567" }], [{ status: "confirmed" }], [{ notificationPhone: "+94771234567", notificationConsentAt: null, notificationVerifiedAt: new Date() }]]);
    expect(await claimOrderSupplierAlert(f.db, "alert", "order")).toBeNull(); expect(f.updates[0]).toMatchObject({ status: "failed" });
  });
  it("refuses work belonging to another supplier", async () => {
    const f = fixture([[]]);
    expect((await updateSupplierFulfilment(f.db, "other", "user", "award", "preparing")).ok).toBe(false);
    expect(f.updates).toEqual([]);
  });
  it("refuses updates after cancellation", async () => {
    const f = fixture([[{ orderStatus: "cancelled", award: { status: "pending", fulfilmentStatus: "confirmed" } }]]);
    expect((await updateSupplierFulfilment(f.db, "shop", "user", "award", "preparing")).ok).toBe(false);
    expect(f.updates).toEqual([]);
  });
});

describe("customer confirmation gateway", () => {
  const order = { id: "order", orderNo: "TEST-001", status: "quoted", updatedAt: new Date(), statusHistory: [] };
  it("rejects an invoice and another order's document without authorizing preparation", async () => {
    for (const docs of [[], [{ type: "invoice" }]]) {
      const f = fixture([[order], docs]);
      expect((await confirmCustomerQuotation(f.db, "order", "doc")).ok).toBe(false);
      expect(f.updates).toEqual([]); expect(f.inserts).toEqual([]);
    }
  });
  it("rejects expired offers and cancelled orders", async () => {
    const expired = fixture([[order], [{ type: "quotation", validUntil: new Date(0) }]]);
    expect((await confirmCustomerQuotation(expired.db, "order", "doc")).ok).toBe(false);
    expect(expired.updates).toEqual([]);
    const cancelled = fixture([[{ ...order, status: "cancelled" }]]);
    expect((await confirmCustomerQuotation(cancelled.db, "order", "doc")).ok).toBe(false);
    expect(cancelled.updates).toEqual([]);
  });
  it("confirms accepted customer work and queues a separate supplier alert", async () => {
    const doc = { id: "doc", type: "quotation", status: "sent", validUntil: null, issuedAt: new Date() };
    const f = fixture([[order], [doc], [doc], [order], [{ shopId: "shop", phone: "+94771234567", language: "en" }]]);
    expect((await confirmCustomerQuotation(f.db, "order", "doc")).ok).toBe(true);
    expect(f.updates[0]).toMatchObject({ status: "accepted" });
    expect(f.updates[1]).toMatchObject({ status: "confirmed" });
    expect(f.inserts[0]).toMatchObject({ orderId: "order", shopId: "shop", eventKey: "order:confirmed" });
  });
});

it("does not send an old preparation alert after customer cancellation", async () => {
  const f = fixture([[{ status: "pending", shopId: "shop", orderId: "order", eventKey: "order:confirmed", phone: "+94771234567" }], [{ status: "cancelled" }]]);
  expect(await claimOrderSupplierAlert(f.db, "alert", "order")).toBeNull();
  expect(f.updates[0]).toMatchObject({ status: "superseded" });
});
