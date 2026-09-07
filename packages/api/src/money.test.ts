import { describe, expect, it } from "vitest";
import { formatRupees, savingsPercent } from "./money";

describe("formatRupees", () => {
  it("formats whole rupees with no decimals", () => {
    expect(formatRupees(6500)).toBe("Rs 65");
    expect(formatRupees(350000)).toBe("Rs 3,500");
  });

  it("groups thousands", () => {
    expect(formatRupees(100000000)).toBe("Rs 1,000,000");
  });

  it("shows two decimals only when cents are non-zero", () => {
    expect(formatRupees(650050)).toBe("Rs 6,500.50");
    expect(formatRupees(105)).toBe("Rs 1.05");
  });

  it("handles zero and negatives", () => {
    expect(formatRupees(0)).toBe("Rs 0");
    expect(formatRupees(-6500)).toBe("-Rs 65");
  });
});

describe("savingsPercent", () => {
  it("returns whole percent saved", () => {
    expect(savingsPercent(6500, 9000)).toBe(28);
    expect(savingsPercent(4000, 6000)).toBe(33);
  });

  it("returns null when there is no genuine saving", () => {
    expect(savingsPercent(6500, null)).toBeNull();
    expect(savingsPercent(6500, undefined)).toBeNull();
    expect(savingsPercent(6500, 6500)).toBeNull();
    expect(savingsPercent(6500, 5000)).toBeNull();
  });
});
