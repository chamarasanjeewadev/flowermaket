import { describe, it, expect } from "vitest";
import {
  DESIGNER_CATEGORY_SLUGS,
  SELLER_TYPES,
  isSellerType,
  normalizeSellerTypes,
} from "./constants";

describe("DESIGNER_CATEGORY_SLUGS", () => {
  it("includes the flower-ingredient categories the designer pulls from", () => {
    expect(DESIGNER_CATEGORY_SLUGS).toEqual([
      "roses",
      "gerberas",
      "orchids",
      "chrysanthemums",
      "loose-flowers",
    ]);
  });
});

describe("normalizeSellerTypes", () => {
  it("dedupes and returns canonical order", () => {
    expect(normalizeSellerTypes(["farmer", "florist", "farmer"])).toEqual([
      "florist",
      "farmer",
    ]);
  });

  it("returns null for empty input", () => {
    expect(normalizeSellerTypes([])).toBeNull();
    expect(normalizeSellerTypes(null)).toBeNull();
    expect(normalizeSellerTypes(undefined)).toBeNull();
  });

  it("returns null when any value is unknown", () => {
    expect(normalizeSellerTypes(["florist", "grower"])).toBeNull();
  });
});

describe("isSellerType", () => {
  it("accepts the three seller types only", () => {
    expect(SELLER_TYPES.every(isSellerType)).toBe(true);
    expect(isSellerType("grower")).toBe(false);
  });
});
