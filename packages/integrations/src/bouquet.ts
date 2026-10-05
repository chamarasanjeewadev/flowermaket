/**
 * Pure, dependency-free helpers for the AI bouquet designer: building the
 * Gemini image-generation prompt and shaping/parsing the Google Generative
 * Language API (gemini-3.1-flash-image `generateContent`) request/response.
 * No I/O here — the server function in apps/web supplies `fetch` and the API key.
 */

export interface BouquetPromptItem {
  /** English flower name — Imagen prompting is English-only. */
  nameEn: string;
  qty: number;
}

/** Keep the prompt (and image) coherent by bounding distinct flower types. */
export const MAX_PROMPT_FLOWERS = 12;

/**
 * Model looks for the "held by a model" option. The user picks one (or
 * "random"); `id` is the stable key sent from the client, labels are for UI.
 */
export const BOUQUET_MODELS = [
  {
    id: "white-shirt",
    labelEn: "White shirt",
    labelSi: "සුදු කමිසය",
    prompt:
      "a young Sri Lankan woman with long straight black hair, wearing a crisp white linen shirt and beige trousers, standing against a plain light-grey studio backdrop, holding the bouquet across her body in the crook of one arm",
  },
  {
    id: "pink-saree",
    labelEn: "Pink saree",
    labelSi: "රෝස සාරිය",
    prompt:
      "a South Asian woman in her late twenties with a low bun, wearing a soft pastel-pink saree draped elegantly, gently smiling, holding the bouquet in both hands at waist height, warm cream studio background",
  },
  {
    id: "black-dress",
    labelEn: "Black dress",
    labelSi: "කළු ගවුම",
    prompt:
      "a young Sri Lankan woman with shoulder-length wavy dark hair, wearing a sleeveless black dress and a thin gold necklace, holding the bouquet upright close to her chest, soft beige backdrop",
  },
  {
    id: "blue-blouse",
    labelEn: "Blue blouse",
    labelSi: "නිල් බ්ලවුසය",
    prompt:
      "a South Asian woman with curly dark hair tied back, wearing a light-blue cotton blouse and white jeans, cradling the bouquet in her arm with a relaxed natural pose, bright airy studio with soft window light",
  },
  {
    id: "green-kurta",
    labelEn: "Green kurta",
    labelSi: "කොළ කුර්තාව",
    prompt:
      "a young Sri Lankan woman in a modern kurta in sage green with small gold earrings, hair in a long braid over one shoulder, holding the bouquet slightly to the side, off-white seamless background",
  },
  {
    id: "ivory-knit",
    labelEn: "Ivory knit top",
    labelSi: "ලා කහ නිට් ටොප්",
    prompt:
      "a South Asian woman in her thirties with a neat side-parted bob, wearing an ivory knit top and tan skirt, holding the bouquet in front of her with both hands, warm taupe studio backdrop",
  },
] as const;

export type BouquetModelId = (typeof BOUQUET_MODELS)[number]["id"];

/** What the client sends: no model, a random look, or a specific look. */
export type BouquetModelChoice = "none" | "random" | BouquetModelId;

/**
 * Resolve an untrusted client choice to a concrete look (or null for no model).
 * Unknown values fall back to no model.
 */
export function resolveBouquetModel(
  choice: unknown,
  random: () => number = Math.random,
): BouquetModelId | null {
  if (choice === "random") {
    const i = Math.floor(random() * BOUQUET_MODELS.length) % BOUQUET_MODELS.length;
    return BOUQUET_MODELS[i].id;
  }
  return BOUQUET_MODELS.find((m) => m.id === choice)?.id ?? null;
}

/** Keeps generated flowers looking like real fresh-cut stems, not CGI. */
const NATURAL_FLOWERS =
  "The flowers look natural and freshly cut: real petal texture with subtle natural " +
  "variation and slight imperfections, true-to-life colours, varied bloom sizes and " +
  "stages of opening, natural greenery and stems, not artificial, not plastic, " +
  "not oversaturated, not CGI.";

export interface BouquetPromptOptions {
  /** Show the bouquet held by this model look; omit for a product-only shot. */
  model?: BouquetModelId | null;
}

export function buildBouquetPrompt(
  items: readonly BouquetPromptItem[],
  _locale: "en" | "si",
  options: BouquetPromptOptions = {},
): string {
  const picked = items.filter((i) => i.qty >= 1).slice(0, MAX_PROMPT_FLOWERS);
  if (picked.length === 0) return "";
  const list = picked.map((i) => `${i.qty} ${i.nameEn}`).join(", ");
  const model = options.model ? BOUQUET_MODELS.find((m) => m.id === options.model) : undefined;
  if (model) {
    return (
      `A photorealistic e-commerce product photo of ${model.prompt}. ` +
      `The bouquet contains ${list}, hand-tied and wrapped in elegant florist paper with a ribbon. ` +
      `${NATURAL_FLOWERS} ` +
      `Framed from the shoulders or chin down to the hips so the bouquet is the clear focal point, ` +
      `face partially cropped or out of focus, natural skin texture, realistic hands with five fingers ` +
      `naturally gripping the stems, true-to-life proportions, soft diffused studio lighting, ` +
      `shallow depth of field, high detail, no text, no watermark.`
    );
  }
  return (
    `A photorealistic professional florist bouquet containing ${list}, ` +
    `hand-tied and wrapped in kraft paper. ${NATURAL_FLOWERS} ` +
    `Soft natural studio lighting, clean neutral background, high detail, no text, no watermark.`
  );
}

/**
 * Which selected items should be added to the enquiry basket: only those not
 * already present. Keeps "Send to WhatsApp" idempotent — repeat clicks don't
 * accumulate quantities (the basket's add() sums qty for existing items).
 */
export function pendingBasketAdditions<T extends { id: string }>(
  selection: readonly T[],
  isInBasket: (id: string) => boolean,
): T[] {
  return selection.filter((item) => !isInBasket(item.id));
}

/** Gemini image generation model. */
export const IMAGEN_MODEL = "gemini-3.1-flash-image";

export function buildImagenEndpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${apiKey}`;
}

export function buildImagenRequest(prompt: string) {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      // Square output so the image fills the square preview boxes in every app.
      imageConfig: { aspectRatio: "1:1" },
    },
  };
}

export function extractImagenImage(json: unknown): { data: string; mimeType: string } | null {
  if (typeof json !== "object" || json === null) return null;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown[] } }).content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (typeof inline?.data === "string" && inline.data.length > 0) {
      return { data: inline.data, mimeType: inline.mimeType ?? "image/jpeg" };
    }
  }
  return null;
}
