import { describe, expect, it } from "vitest";
import {
  budgetBandFor, canAccept, canQuote, computeQuoteDeadline, effectiveRequestStatus,
  generateAccessToken, generateRequestRef, hashAccessToken, parseRupeesToCents, shouldNotifyCustomer,
} from "./rules";
import type { OfferStatus, RequestStatus } from "./constants";

const d = (s: string) => new Date(s);

describe("computeQuoteDeadline", () => {
  it("24h cap", () =>
    expect(computeQuoteDeadline(d("2026-10-16T04:00:00Z"), "2026-10-20", "morning").toISOString()).toBe("2026-10-17T04:00:00.000Z"));
  it("2h before window", () =>
    expect(computeQuoteDeadline(d("2026-10-16T00:00:00Z"), "2026-10-16", "evening").toISOString()).toBe("2026-10-16T08:30:00.000Z"));
  it("1h floor", () =>
    expect(computeQuoteDeadline(d("2026-10-16T05:00:00Z"), "2026-10-16", "morning").toISOString()).toBe("2026-10-16T06:00:00.000Z"));
});

describe("canQuote", () => {
  const open = { status: "open" as RequestStatus, quoteDeadlineAt: d("2026-10-17T00:00:00Z"), neededOn: "2026-10-20" };
  const now = d("2026-10-16T10:00:00Z");
  it.each(["sent", "viewed", "quoted", "declined", "send_failed"] as OfferStatus[])("ok for %s", (s) =>
    expect(canQuote({ status: s }, open, now).ok).toBe(true));
  it.each(["pending_approval", "skipped", "accepted", "not_selected", "expired"] as OfferStatus[])("validation for %s", (s) => {
    const r = canQuote({ status: s }, open, now);
    expect(!r.ok && r.code).toBe("validation");
  });
  it("past deadline", () => {
    const r = canQuote({ status: "sent" }, open, d("2026-10-17T00:00:01Z"));
    expect(r).toEqual({ ok: false, code: "validation", message: "closed" });
  });
  it.each(["accepted", "cancelled", "expired", "completed"] as RequestStatus[])("closed when request %s", (s) => {
    const r = canQuote({ status: "sent" }, { ...open, status: s }, now);
    expect(r).toEqual({ ok: false, code: "validation", message: "closed" });
  });
});

describe("canAccept", () => {
  const req = { id: "r1", status: "open" as RequestStatus, neededOn: "2026-10-20" };
  const now = d("2026-10-16T10:00:00Z");
  it("conflict when accepted", () => {
    const r = canAccept({ status: "quoted", requestId: "r1" }, { ...req, status: "accepted" }, now);
    expect(!r.ok && r.code).toBe("conflict");
  });
  it("validation when not quoted", () => {
    const r = canAccept({ status: "sent", requestId: "r1" }, req, now);
    expect(!r.ok && r.code).toBe("validation");
  });
  it("validation on request mismatch", () => {
    const r = canAccept({ status: "quoted", requestId: "other" }, req, now);
    expect(!r.ok && r.code).toBe("validation");
  });
  it("ok after quote deadline but before end of day", () =>
    expect(canAccept({ status: "quoted", requestId: "r1" }, req, d("2026-10-18T00:00:00Z")).ok).toBe(true));
  it("validation after end of needed day", () => {
    const r = canAccept({ status: "quoted", requestId: "r1" }, req, d("2026-10-21T00:00:00Z"));
    expect(!r.ok && r.code).toBe("validation");
  });
});

describe("misc rules", () => {
  it("effectiveRequestStatus", () => {
    expect(effectiveRequestStatus({ status: "open", neededOn: "2026-10-15" }, d("2026-10-16T00:00:00Z"))).toBe("expired");
    expect(effectiveRequestStatus({ status: "open", neededOn: "2026-10-16" }, d("2026-10-16T00:00:00Z"))).toBe("open");
    expect(effectiveRequestStatus({ status: "accepted", neededOn: "2026-10-15" }, d("2026-10-16T00:00:00Z"))).toBe("accepted");
  });
  it("parseRupeesToCents", () => {
    expect(parseRupeesToCents("4,500")).toBe(450000);
    expect(parseRupeesToCents("4500.5")).toBe(450050);
    expect(parseRupeesToCents("Rs 3000")).toBe(300000);
    expect(parseRupeesToCents("Rs. 1,250.25")).toBe(125025);
    for (const bad of ["0", "-5", "", "abc", "1.234"]) expect(parseRupeesToCents(bad)).toBeNull();
  });
  it("shouldNotifyCustomer", () => {
    const now = d("2026-10-16T10:00:00Z");
    expect(shouldNotifyCustomer(null, now)).toBe(true);
    expect(shouldNotifyCustomer(d("2026-10-16T09:00:00Z"), now)).toBe(false);
    expect(shouldNotifyCustomer(d("2026-10-16T08:00:00Z"), now)).toBe(true);
  });
  it("budgetBandFor", () => {
    expect(budgetBandFor("3k_5k")).toEqual({ minCents: 300000, maxCents: 500000 });
    expect(budgetBandFor("20k_plus").maxCents).toBeNull();
  });
  it("ref + tokens", async () => {
    expect(generateRequestRef()).toMatch(/^LR-[A-HJ-NP-Z2-9]{6}$/);
    const a = generateAccessToken();
    expect(a).not.toBe(generateAccessToken());
    expect(a).toHaveLength(43);
    const h = await hashAccessToken("x");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAccessToken("x")).toBe(h);
  });
});
