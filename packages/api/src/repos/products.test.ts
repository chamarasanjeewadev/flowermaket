import { describe, expect, it } from "vitest";
import {
  validateCreateProductInput,
  validateUpdateProductInput,
  type CreateProductInput,
} from "./products";

describe("validateCreateProductInput", () => {
  const valid: CreateProductInput = {
    categoryId: "11111111-1111-1111-1111-111111111111",
    nameEn: "Red Gerbera",
    price: 5000,
  };

  it("passes for valid minimal input", () => {
    expect(validateCreateProductInput(valid)).toEqual([]);
  });

  it("passes with all optional fields", () => {
    expect(
      validateCreateProductInput({
        ...valid,
        nameSi: "රතු ජර්බෙරා",
        descriptionEn: "Fresh cut gerbera",
        descriptionSi: "නැවුම් ජර්බෙරා",
        compareAtPrice: 6000,
        stockQty: 500,
        leadTimeDays: 2,
        listingType: "wholesale",
        minOrderQty: 50,
        status: "active",
      }),
    ).toEqual([]);
  });

  it("requires a category", () => {
    const errors = validateCreateProductInput({ ...valid, categoryId: "" });
    expect(errors.some((e) => e.field === "categoryId")).toBe(true);
  });

  it("rejects empty nameEn", () => {
    const errors = validateCreateProductInput({ ...valid, nameEn: "" });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects whitespace-only nameEn", () => {
    const errors = validateCreateProductInput({ ...valid, nameEn: "   " });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn shorter than 2 chars", () => {
    const errors = validateCreateProductInput({ ...valid, nameEn: "A" });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects nameEn longer than 100 chars", () => {
    const errors = validateCreateProductInput({
      ...valid,
      nameEn: "A".repeat(101),
    });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("rejects zero or negative price", () => {
    expect(
      validateCreateProductInput({ ...valid, price: 0 }).some(
        (e) => e.field === "price",
      ),
    ).toBe(true);
    expect(
      validateCreateProductInput({ ...valid, price: -100 }).some(
        (e) => e.field === "price",
      ),
    ).toBe(true);
  });

  it("rejects non-integer price (floats not allowed for money)", () => {
    const errors = validateCreateProductInput({ ...valid, price: 12.5 });
    expect(errors.some((e) => e.field === "price")).toBe(true);
  });

  it("rejects compareAtPrice not greater than price", () => {
    const errors = validateCreateProductInput({
      ...valid,
      price: 5000,
      compareAtPrice: 5000,
    });
    expect(errors.some((e) => e.field === "compareAtPrice")).toBe(true);
  });

  it("accepts compareAtPrice greater than price", () => {
    expect(
      validateCreateProductInput({ ...valid, price: 5000, compareAtPrice: 5001 }),
    ).toEqual([]);
  });

  it("rejects negative stockQty but accepts zero", () => {
    expect(
      validateCreateProductInput({ ...valid, stockQty: -1 }).some(
        (e) => e.field === "stockQty",
      ),
    ).toBe(true);
    expect(validateCreateProductInput({ ...valid, stockQty: 0 })).toEqual([]);
  });

  it("rejects minOrderQty below 1", () => {
    const errors = validateCreateProductInput({ ...valid, minOrderQty: 0 });
    expect(errors.some((e) => e.field === "minOrderQty")).toBe(true);
  });

  it("rejects an invalid listingType", () => {
    const errors = validateCreateProductInput({
      ...valid,
      // @ts-expect-error deliberately invalid
      listingType: "auction",
    });
    expect(errors.some((e) => e.field === "listingType")).toBe(true);
  });

  it("rejects an invalid status", () => {
    const errors = validateCreateProductInput({
      ...valid,
      // @ts-expect-error deliberately invalid
      status: "live",
    });
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const errors = validateCreateProductInput({
      categoryId: "",
      nameEn: "",
      price: -1,
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateUpdateProductInput", () => {
  it("passes for empty patch (all optional)", () => {
    expect(validateUpdateProductInput({})).toEqual([]);
  });

  it("passes for a valid price-only patch", () => {
    expect(validateUpdateProductInput({ price: 7500 })).toEqual([]);
  });

  it("rejects clearing the category", () => {
    const errors = validateUpdateProductInput({ categoryId: "" });
    expect(errors.some((e) => e.field === "categoryId")).toBe(true);
  });

  it("rejects nameEn that trims to empty", () => {
    const errors = validateUpdateProductInput({ nameEn: "   " });
    expect(errors.some((e) => e.field === "nameEn")).toBe(true);
  });

  it("allows setting optional fields to null", () => {
    expect(
      validateUpdateProductInput({
        nameSi: null,
        descriptionEn: null,
        compareAtPrice: null,
        stockQty: null,
        minOrderQty: null,
      }),
    ).toEqual([]);
  });

  it("still validates present numeric fields", () => {
    const errors = validateUpdateProductInput({ stockQty: -5 });
    expect(errors.some((e) => e.field === "stockQty")).toBe(true);
  });
});
