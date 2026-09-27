import { describe, expect, it } from "vitest";
import { applyMargin, documentTotals } from "./pricing";

describe("applyMargin — pure helper", () => {
  it("applies 25% margin", () => expect(applyMargin(10000, 2500)).toBe(12500));
  it("rounds to nearest cent", () => expect(applyMargin(333, 2500)).toBe(416)); // 416.25 -> 416
});

describe("documentTotals — pure helper", () => {
  it("totals sum line qty*price", () => {
    expect(
      documentTotals([
        { qty: 100, unitPrice: 125 },
        { qty: 15, unitPrice: 200 },
      ]).subtotal,
    ).toBe(15500);
  });

  it("total adds delivery and subtracts discount", () => {
    expect(
      documentTotals([{ qty: 1, unitPrice: 1000 }], {
        discount: 200,
        deliveryFee: 300,
      }).total,
    ).toBe(1100);
  });
});
