import { describe, expect, it } from "vitest";
import { assertOwnsRfq, dedupeSupplierIds } from "./rfqs";

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
