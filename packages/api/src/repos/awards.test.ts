import { describe, expect, it } from "vitest";
import { remainingQty, validateAward } from "./awards";

const item = 100;

describe("remainingQty — pure helper", () => {
  it("subtracts non-cancelled awards from item quantity", () => {
    expect(
      remainingQty(item, [
        { awardedQty: 40, status: "pending" },
        { awardedQty: 10, status: "cancelled" },
      ]),
    ).toBe(60);
  });

  it("returns full quantity when all awards are cancelled", () => {
    expect(
      remainingQty(item, [
        { awardedQty: 50, status: "cancelled" },
        { awardedQty: 30, status: "cancelled" },
      ]),
    ).toBe(100);
  });

  it("returns full quantity when there are no awards", () => {
    expect(remainingQty(item, [])).toBe(100);
  });

  it("treats confirmed awards the same as pending (non-cancelled)", () => {
    expect(
      remainingQty(item, [
        { awardedQty: 60, status: "confirmed" },
        { awardedQty: 20, status: "pending" },
      ]),
    ).toBe(20);
  });
});

describe("validateAward — pure invariant guard (over-allocation focus)", () => {
  it("rejects award that exceeds remaining quantity", () => {
    expect(
      validateAward(item, [{ awardedQty: 90, status: "confirmed" }], 20).length,
    ).toBeGreaterThan(0);
  });

  it("accepts award that exactly fits remaining quantity", () => {
    expect(
      validateAward(item, [{ awardedQty: 90, status: "confirmed" }], 10),
    ).toEqual([]);
  });

  it("rejects non-positive award quantity (zero)", () => {
    expect(validateAward(item, [], 0).length).toBeGreaterThan(0);
  });

  it("rejects non-positive award quantity (negative)", () => {
    expect(validateAward(item, [], -5).length).toBeGreaterThan(0);
  });

  it("rejects non-integer award quantity", () => {
    expect(validateAward(item, [], 1.5).length).toBeGreaterThan(0);
  });

  it("accepts award within remaining (cancelled awards not counted)", () => {
    // 90 cancelled + 5 pending = only 5 used; 95 remaining, award 50 should pass
    expect(
      validateAward(
        item,
        [
          { awardedQty: 90, status: "cancelled" },
          { awardedQty: 5, status: "pending" },
        ],
        50,
      ),
    ).toEqual([]);
  });
});
