import { describe, expect, it } from "vitest";
import { formatCents } from "./payhere";

describe("formatCents", () => {
  it("formats whole rupees", () => {
    expect(formatCents(100)).toBe("1.00");
  });

  it("formats mixed amounts", () => {
    expect(formatCents(123456)).toBe("1234.56");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("0.00");
  });

  it("pads sub-rupee amounts", () => {
    expect(formatCents(5)).toBe("0.05");
  });

  it("is negative-safe", () => {
    expect(formatCents(-1)).toBe("-0.01");
    expect(formatCents(-123456)).toBe("-1234.56");
  });
});
