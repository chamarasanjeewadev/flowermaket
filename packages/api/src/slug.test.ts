import { describe, expect, it } from "vitest";
import { generateJobSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Senior Software Engineer")).toBe(
      "senior-software-engineer",
    );
  });

  it("folds diacritics and symbols", () => {
    expect(slugify("Café Manager — Nuwara Eliya")).toBe(
      "cafe-manager-nuwara-eliya",
    );
  });

  it("expands ampersands", () => {
    expect(slugify("Sales & Marketing")).toBe("sales-and-marketing");
  });

  it("trims leading/trailing separators", () => {
    expect(slugify("  --hello world--  ")).toBe("hello-world");
  });
});

describe("generateJobSlug", () => {
  it("combines title and city with a 6-char suffix", () => {
    const slug = generateJobSlug("Senior Accountant", "Colombo");
    expect(slug).toMatch(/^senior-accountant-colombo-[a-z0-9]{6}$/);
  });

  it("handles missing city", () => {
    expect(generateJobSlug("Data Analyst", null)).toMatch(
      /^data-analyst-[a-z0-9]{6}$/,
    );
  });

  it("never returns an empty base", () => {
    expect(generateJobSlug("###", null)).toMatch(/^job-[a-z0-9]{6}$/);
  });

  it("produces unique slugs across calls", () => {
    const slugs = new Set(
      Array.from({ length: 50 }, () => generateJobSlug("Clerk", "Kandy")),
    );
    expect(slugs.size).toBe(50);
  });
});
