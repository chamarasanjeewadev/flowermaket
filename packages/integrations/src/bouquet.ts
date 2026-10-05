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
 * Model presets for the "held by a model" option. One is picked per generation
 * so repeated previews show different women, outfits, poses and backdrops.
 */
export const BOUQUET_MODEL_VARIANTS: readonly string[] = [
  "a young Sri Lankan woman with long straight black hair, wearing a crisp white linen shirt and beige trousers, standing against a plain light-grey studio backdrop, holding the bouquet across her body in the crook of one arm",
  "a South Asian woman in her late twenties with a low bun, wearing a soft pastel-pink saree draped elegantly, gently smiling, holding the bouquet in both hands at waist height, warm cream studio background",
  "a young Sri Lankan woman with shoulder-length wavy dark hair, wearing a sleeveless black dress and a thin gold necklace, holding the bouquet upright close to her chest, soft beige backdrop",
  "a South Asian woman with curly dark hair tied back, wearing a light-blue cotton blouse and white jeans, cradling the bouquet in her arm with a relaxed natural pose, bright airy studio with soft window light",
  "a young Sri Lankan woman in a modern kurta in sage green with small gold earrings, hair in a long braid over one shoulder, holding the bouquet slightly to the side, off-white seamless background",
  "a South Asian woman in her thirties with a neat side-parted bob, wearing an ivory knit top and tan skirt, holding the bouquet in front of her with both hands, warm taupe studio backdrop",
];

export interface BouquetPromptOptions {
  /** Show the bouquet held by a model instead of a product-only shot. */
  heldByModel?: boolean;
  /** Index into BOUQUET_MODEL_VARIANTS (wrapped). Defaults to 0. */
  modelVariant?: number;
}

/** Random variant index — the server calls this so the client can't steer it. */
export function pickModelVariant(random: () => number = Math.random): number {
  return Math.floor(random() * BOUQUET_MODEL_VARIANTS.length) % BOUQUET_MODEL_VARIANTS.length;
}

export function buildBouquetPrompt(
  items: readonly BouquetPromptItem[],
  _locale: "en" | "si",
  options: BouquetPromptOptions = {},
): string {
  const picked = items.filter((i) => i.qty >= 1).slice(0, MAX_PROMPT_FLOWERS);
  if (picked.length === 0) return "";
  const list = picked.map((i) => `${i.qty} ${i.nameEn}`).join(", ");
  if (options.heldByModel) {
    const n = BOUQUET_MODEL_VARIANTS.length;
    const idx = (((options.modelVariant ?? 0) % n) + n) % n;
    return (
      `A photorealistic e-commerce product photo of ${BOUQUET_MODEL_VARIANTS[idx]}. ` +
      `The bouquet contains ${list}, hand-tied and wrapped in elegant florist paper with a ribbon. ` +
      `Framed from the shoulders or chin down to the hips so the bouquet is the clear focal point, ` +
      `face partially cropped or out of focus, natural skin texture, realistic hands with five fingers ` +
      `naturally gripping the stems, true-to-life proportions, soft diffused studio lighting, ` +
      `shallow depth of field, high detail, no text, no watermark.`
    );
  }
  return (
    `A photorealistic professional florist bouquet containing ${list}, ` +
    `hand-tied and wrapped in kraft paper, soft natural studio lighting, ` +
    `clean neutral background, high detail, no text, no watermark.`
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
