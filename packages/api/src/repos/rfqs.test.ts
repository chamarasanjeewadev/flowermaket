import { describe, expect, it } from "vitest";
import { assertOwnsRfq } from "./rfqs";

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
