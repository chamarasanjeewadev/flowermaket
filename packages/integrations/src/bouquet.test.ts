import { describe, it, expect } from "vitest";
import {
  buildBouquetPrompt,
  BOUQUET_MODELS,
  resolveBouquetModel,
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
  it("builds the generateContent endpoint with the model and key", () => {
    expect(buildImagenEndpoint("KEY123")).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=KEY123`,
    );
  });

  it("builds a generateContent request with IMAGE responseModality", () => {
    const body = buildImagenRequest("a bouquet");
    expect(body.contents[0].parts[0].text).toBe("a bouquet");
    expect(body.generationConfig.responseModalities).toContain("IMAGE");
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("1:1");
  });

  it("extracts the base64 image from a Gemini generateContent response", () => {
    const response = {
      candidates: [
        { content: { parts: [{ inlineData: { data: "AAAA", mimeType: "image/jpeg" } }] } },
      ],
    };
    expect(extractImagenImage(response)).toEqual({ data: "AAAA", mimeType: "image/jpeg" });
  });

  it("returns null when candidates are missing, empty, or have no image part", () => {
    expect(extractImagenImage({})).toBeNull();
    expect(extractImagenImage({ candidates: [] })).toBeNull();
    expect(extractImagenImage({ candidates: [{ content: { parts: [{ text: "hi" }] } }] })).toBeNull();
    expect(extractImagenImage(null)).toBeNull();
  });
});

describe("buildBouquetPrompt — held by a model", () => {
  it("describes the chosen model look holding the bouquet", () => {
    const p = buildBouquetPrompt(items, "en", { model: "pink-saree" });
    expect(p).toContain(BOUQUET_MODELS[1].prompt);
    expect(p).toContain("5 Red Rose (per stem)");
    expect(p.toLowerCase()).toContain("photorealistic");
  });

  it("keeps the product-only shot when no model is given", () => {
    for (const opts of [{}, { model: null }]) {
      const p = buildBouquetPrompt(items, "en", opts);
      for (const m of BOUQUET_MODELS) expect(p).not.toContain(m.prompt);
    }
  });

  it("asks for natural-looking flowers in both shot types", () => {
    for (const opts of [{}, { model: "black-dress" as const }]) {
      const p = buildBouquetPrompt(items, "en", opts).toLowerCase();
      expect(p).toContain("natural");
      expect(p).toContain("not artificial");
    }
  });

  it("still returns empty when nothing is selected", () => {
    expect(buildBouquetPrompt([], "en", { model: "white-shirt" })).toBe("");
  });
});

describe("resolveBouquetModel", () => {
  it("passes known ids through", () => {
    expect(resolveBouquetModel("green-kurta")).toBe("green-kurta");
  });

  it("maps none, unknown and non-string input to no model", () => {
    for (const v of ["none", "bogus", undefined, 3, null]) expect(resolveBouquetModel(v)).toBeNull();
  });

  it("picks an in-range look for random", () => {
    expect(resolveBouquetModel("random", () => 0)).toBe(BOUQUET_MODELS[0].id);
    expect(resolveBouquetModel("random", () => 0.9999)).toBe(
      BOUQUET_MODELS[BOUQUET_MODELS.length - 1].id,
    );
  });
});
