import { describe, it, expect } from "vitest";
import { DESIGNER_CATEGORY_SLUGS } from "./constants";

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
