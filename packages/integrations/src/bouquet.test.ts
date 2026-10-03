import { describe, it, expect } from "vitest";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  IMAGEN_MODEL,
  MAX_PROMPT_FLOWERS,
  pendingBasketAdditions,
  type BouquetPromptItem,
} from "./bouquet";

const items: BouquetPromptItem[] = [
  { nameEn: "Red Rose (per stem)", qty: 5 },
  { nameEn: "Pink Gerbera (per stem)", qty: 1 },
];

describe("buildBouquetPrompt", () => {
  it("lists flowers with quantities and photorealistic framing", () => {
    const p = buildBouquetPrompt(items, "en");
    expect(p).toContain("5 Red Rose (per stem)");
    expect(p).toContain("1 Pink Gerbera (per stem)");
    expect(p.toLowerCase()).toContain("photorealistic");
    expect(p.toLowerCase()).toContain("bouquet");
  });

  it("drops flowers with qty < 1", () => {
    const p = buildBouquetPrompt(
      [
        { nameEn: "Red Rose (per stem)", qty: 0 },
        { nameEn: "White Lily", qty: 3 },
      ],
      "en",
    );
    expect(p).not.toContain("Red Rose");
    expect(p).toContain("3 White Lily");
  });

  it("caps the number of distinct flowers at MAX_PROMPT_FLOWERS", () => {
    const many: BouquetPromptItem[] = Array.from({ length: 20 }, (_, i) => ({
      nameEn: `Flower${i}`,
      qty: 1,
    }));
    const p = buildBouquetPrompt(many, "en");
    expect(p).toContain("Flower0");
    expect(p).not.toContain(`Flower${MAX_PROMPT_FLOWERS}`); // the 13th (index 12) is trimmed
  });

  it("returns an empty string when nothing is selected", () => {
    expect(buildBouquetPrompt([], "en")).toBe("");
    expect(buildBouquetPrompt([{ nameEn: "X", qty: 0 }], "en")).toBe("");
  });
});

describe("pendingBasketAdditions", () => {
  const sel = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns all items when none are in the basket", () => {
    expect(pendingBasketAdditions(sel, () => false)).toEqual(sel);
  });

  it("skips items already in the basket (no double-add on repeat clicks)", () => {
    const inBasket = new Set(["a", "c"]);
    expect(pendingBasketAdditions(sel, (id) => inBasket.has(id))).toEqual([
      { id: "b" },
    ]);
  });

  it("returns nothing when every item is already in the basket (idempotent)", () => {
    expect(pendingBasketAdditions(sel, () => true)).toEqual([]);
  });
});

describe("imagen helpers", () => {
  it("builds the predict endpoint with the model and key", () => {
    expect(buildImagenEndpoint("KEY123")).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=KEY123`,
    );
  });

  it("builds a single-sample square request", () => {
    const body = buildImagenRequest("a bouquet");
    expect(body.instances[0].prompt).toBe("a bouquet");
    expect(body.parameters.sampleCount).toBe(1);
    expect(body.parameters.aspectRatio).toBe("1:1");
  });

  it("extracts the base64 image from a prediction", () => {
    expect(
      extractImagenImage({ predictions: [{ bytesBase64Encoded: "AAAA" }] }),
    ).toBe("AAAA");
  });

  it("returns null when predictions are missing or empty", () => {
    expect(extractImagenImage({})).toBeNull();
    expect(extractImagenImage({ predictions: [] })).toBeNull();
    expect(extractImagenImage({ predictions: [{}] })).toBeNull();
    expect(extractImagenImage(null)).toBeNull();
  });
});
