import { describe, expect, it } from "vitest";
import { assertOwnsRfq, canSubmitQuote, dedupeSupplierIds } from "./rfqs";

describe("assertOwnsRfq — pure tenant guard", () => {
  it("rejects RFQ owned by another shop", () => {
    expect(assertOwnsRfq({ supplierShopId: "A" }, "B").ok).toBe(false);
  });

  it("passes RFQ owned by the shop", () => {
    expect(assertOwnsRfq({ supplierShopId: "A" }, "A").ok).toBe(true);
  });

  it("rejected result has not_found code", () => {
    const result = assertOwnsRfq({ supplierShopId: "A" }, "B");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_found");
    }
  });
});

describe("canSubmitQuote — pure state guard", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("allows quoting a sent RFQ", () => {
    expect(canSubmitQuote({ status: "sent", expiresAt: null }, now).ok).toBe(true);
  });

  it("allows quoting a viewed RFQ", () => {
    expect(canSubmitQuote({ status: "viewed", expiresAt: null }, now).ok).toBe(true);
  });

  it("allows re-quoting an already-quoted RFQ", () => {
    expect(canSubmitQuote({ status: "quoted", expiresAt: null }, now).ok).toBe(true);
  });

  it.each(["declined", "awarded", "closed", "expired"] as const)(
    "rejects quoting a %s RFQ",
    (status) => {
      const result = canSubmitQuote({ status, expiresAt: null }, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("validation");
    },
  );

  it("rejects quoting past expiresAt even when status is still open", () => {
    const expired = new Date(now.getTime() - 1000);
    expect(canSubmitQuote({ status: "sent", expiresAt: expired }, now).ok).toBe(false);
  });

  it("allows quoting before expiresAt", () => {
    const future = new Date(now.getTime() + 1000);
    expect(canSubmitQuote({ status: "sent", expiresAt: future }, now).ok).toBe(true);
  });
});

describe("dedupeSupplierIds — pure helper", () => {
  it("drops suppliers already RFQ'd", () => {
    expect(dedupeSupplierIds(["A", "B"], ["B", "C"])).toEqual(["C"]);
  });

  it("returns all requested when existing is empty", () => {
    expect(dedupeSupplierIds([], ["X", "Y"])).toEqual(["X", "Y"]);
  });

  it("returns empty array when all requested are already existing", () => {
    expect(dedupeSupplierIds(["A", "B"], ["A", "B"])).toEqual([]);
  });

  it("returns empty array when requested is empty", () => {
    expect(dedupeSupplierIds(["A"], [])).toEqual([]);
  });

  it("preserves order of requested", () => {
    expect(dedupeSupplierIds(["A"], ["Z", "B", "A", "C"])).toEqual(["Z", "B", "C"]);
  });
});
