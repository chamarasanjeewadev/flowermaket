import { describe, expect, it } from "vitest";
import {
  validateCreateShopInput,
  validateUpdateShopInput,
} from "./shops";

describe("validateCreateShopInput", () => {
  const valid = {
    nameEn: "Rose Garden",
    district: "colombo",
  };

  it("passes for valid minimal input", () => {
    expect(validateCreateShopInput(valid)).toEqual([]);
  });

  it("passes with all optional fields", () => {
    expect(
      validateCreateShopInput({
        nameEn: "Lanka Flowers",
        nameSi: "ලංකා මල්",
        descriptionEn: "Fresh flowers daily",
        descriptionSi: "දිනපතා නැවුම් මල්",
        district: "kandy",
        city: "Kandy",
      }),
    ).toEqual([]);
  });

  it("rejects empty nameEn", () => {
    const errors = validateCreateShopInput({ ...valid, nameEn: "" });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn that is only whitespace", () => {
    const errors = validateCreateShopInput({ ...valid, nameEn: "   " });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn shorter than 2 chars", () => {
    const errors = validateCreateShopInput({ ...valid, nameEn: "A" });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn longer than 100 chars", () => {
    const errors = validateCreateShopInput({
      ...valid,
      nameEn: "A".repeat(101),
    });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("accepts nameEn of exactly 2 chars", () => {
    expect(validateCreateShopInput({ ...valid, nameEn: "AB" })).toEqual([]);
  });

  it("accepts nameEn of exactly 100 chars", () => {
    expect(
      validateCreateShopInput({ ...valid, nameEn: "A".repeat(100) }),
    ).toEqual([]);
  });

  it("rejects unknown district slug", () => {
    const errors = validateCreateShopInput({ ...valid, district: "mars" });
    expect(errors.some((e) => e.field === "district")).toBe(true);
  });

  it("rejects empty district", () => {
    const errors = validateCreateShopInput({ ...valid, district: "" });
    expect(errors.some((e) => e.field === "district")).toBe(true);
  });

  it("accepts all 25 district slugs", () => {
    const slugs = [
      "colombo", "gampaha", "kalutara", "kandy", "matale",
      "nuwara-eliya", "galle", "matara", "hambantota", "jaffna",
      "kilinochchi", "mannar", "vavuniya", "mullaitivu", "batticaloa",
      "ampara", "trincomalee", "kurunegala", "puttalam", "anuradhapura",
      "polonnaruwa", "badulla", "moneragala", "ratnapura", "kegalle",
    ];
    for (const slug of slugs) {
      const errors = validateCreateShopInput({ ...valid, district: slug });
      expect(errors.some((e) => e.field === "district")).toBe(false);
    }
  });

  it("collects multiple errors at once", () => {
    const errors = validateCreateShopInput({ nameEn: "", district: "bad" });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateUpdateShopInput", () => {
  it("passes for empty patch (all optional)", () => {
    expect(validateUpdateShopInput({})).toEqual([]);
  });

  it("passes for valid nameEn update", () => {
    expect(validateUpdateShopInput({ nameEn: "New Name" })).toEqual([]);
  });

  it("rejects nameEn that trims to empty", () => {
    const errors = validateUpdateShopInput({ nameEn: "   " });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn shorter than 2 chars after trim", () => {
    const errors = validateUpdateShopInput({ nameEn: "X" });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn longer than 100 chars", () => {
    const errors = validateUpdateShopInput({ nameEn: "B".repeat(101) });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("allows setting optional fields to null", () => {
    expect(
      validateUpdateShopInput({ nameSi: null, descriptionEn: null, city: null }),
    ).toEqual([]);
  });
});
