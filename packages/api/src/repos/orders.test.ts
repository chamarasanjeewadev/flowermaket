import { describe, expect, it } from "vitest";
import {
  canTransition,
  nextOrderNo,
  normalizeStoredPhone,
  validateCreateOrderInput,
  validateOrderItemInput,
} from "./orders";

describe("validateCreateOrderInput", () => {
  const valid = {
    customerName: "Nimal",
    customerPhone: "0771234567",
    items: [{ descriptionEn: "White Roses", quantity: 100, unit: "stem" }],
  };

  it("passes for minimal valid input", () => {
    expect(validateCreateOrderInput(valid)).toEqual([]);
  });
  it("rejects empty customerName", () => {
    expect(validateCreateOrderInput({ ...valid, customerName: " " }).some((e) => e.field === "customerName")).toBe(true);
  });
  it("rejects short phone", () => {
    expect(validateCreateOrderInput({ ...valid, customerPhone: "123" }).some((e) => e.field === "customerPhone")).toBe(true);
  });
  it("rejects unknown delivery district", () => {
    expect(validateCreateOrderInput({ ...valid, deliveryDistrict: "mars" }).some((e) => e.field === "deliveryDistrict")).toBe(true);
  });
  it("rejects an order with no items (nothing to source)", () => {
    expect(validateCreateOrderInput({ ...valid, items: [] }).some((e) => e.field === "items")).toBe(true);
    expect(validateCreateOrderInput({ ...valid, items: undefined }).some((e) => e.field === "items")).toBe(true);
  });
  it("rejects an unknown order source", () => {
    expect(
      validateCreateOrderInput({ ...valid, source: "carrier_pigeon" as never }).some(
        (e) => e.field === "source",
      ),
    ).toBe(true);
  });
  it("accepts a known order source", () => {
    expect(validateCreateOrderInput({ ...valid, source: "walk_in" })).toEqual([]);
  });
});

describe("normalizeStoredPhone", () => {
  it("strips spaces, dashes and plus", () => {
    expect(normalizeStoredPhone("+94 77 123-4567")).toBe("94771234567");
  });
  it("keeps local format digits as-is", () => {
    expect(normalizeStoredPhone("0771234567")).toBe("0771234567");
  });
});

describe("nextOrderNo", () => {
  it("zero-pads the sequence", () => {
    expect(nextOrderNo(2026, 1)).toBe("FM-2026-0001");
    expect(nextOrderNo(2026, 42)).toBe("FM-2026-0042");
  });
});

describe("canTransition", () => {
  it("allows draft -> sourcing", () => expect(canTransition("draft", "sourcing")).toBe(true));
  it("allows any -> cancelled", () => expect(canTransition("quoted", "cancelled")).toBe(true));
  it("rejects skipping quoted -> paid", () => expect(canTransition("quoted", "paid")).toBe(false));
  it("rejects backward completed -> draft", () => expect(canTransition("completed", "draft")).toBe(false));
});

describe("validateOrderItemInput", () => {
  const item = { descriptionEn: "White Roses", quantity: 100, unit: "stem" };
  it("passes for valid item", () => {
    expect(validateOrderItemInput(item)).toEqual([]);
  });
  it("rejects quantity <= 0", () => {
    expect(validateOrderItemInput({ ...item, quantity: 0 }).some((e) => e.field === "quantity")).toBe(true);
  });
  it("rejects non-integer quantity", () => {
    expect(validateOrderItemInput({ ...item, quantity: 1.5 }).some((e) => e.field === "quantity")).toBe(true);
  });
  it("rejects unknown unit", () => {
    expect(validateOrderItemInput({ ...item, unit: "ton" }).some((e) => e.field === "unit")).toBe(true);
  });
});
