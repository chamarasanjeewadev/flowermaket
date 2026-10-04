import { describe, expect, it } from "vitest";
import { variantDisplayName } from "./flowers";

describe("variantDisplayName", () => {
  it("combines color and species in English", () => {
    const row = { colorEn: "Red", colorSi: "රතු", nameEn: "Rose", nameSi: "රෝස" };
    expect(variantDisplayName(row, "en")).toBe("Red Rose");
  });

  it("combines color and species in Sinhala", () => {
    const row = { colorEn: "Red", colorSi: "රතු", nameEn: "Rose", nameSi: "රෝස" };
    expect(variantDisplayName(row, "si")).toBe("රතු රෝස");
  });

  it("returns just species name when colorEn is null", () => {
    const row = { colorEn: null, colorSi: null, nameEn: "Lotus", nameSi: "නෙළුම්" };
    expect(variantDisplayName(row, "en")).toBe("Lotus");
  });

  it("returns just species nameSi when colorSi is null and locale is si", () => {
    const row = { colorEn: "Red", colorSi: null, nameEn: "Rose", nameSi: "රෝස" };
    expect(variantDisplayName(row, "si")).toBe("Red රෝස");
  });

  it("does not produce the string 'null' in the output", () => {
    const row = { colorEn: null, colorSi: null, nameEn: "Lotus", nameSi: "නෙළුම්" };
    expect(variantDisplayName(row, "en")).not.toContain("null");
    expect(variantDisplayName(row, "si")).not.toContain("null");
  });
});
