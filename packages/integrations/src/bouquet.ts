/**
 * Pure, dependency-free helpers for the AI bouquet designer: building the
 * Imagen text prompt from a flower selection, and shaping/parsing the Google
 * Generative Language API (Imagen `:predict`) request/response. No I/O here —
 * the server function in apps/web supplies `fetch` and the API key.
 */

export interface BouquetPromptItem {
  /** English flower name — Imagen prompting is English-only. */
  nameEn: string;
  qty: number;
}

/** Keep the prompt (and image) coherent by bounding distinct flower types. */
export const MAX_PROMPT_FLOWERS = 12;

export function buildBouquetPrompt(
  items: readonly BouquetPromptItem[],
  _locale: "en" | "si",
): string {
  const picked = items.filter((i) => i.qty >= 1).slice(0, MAX_PROMPT_FLOWERS);
  if (picked.length === 0) return "";
  const list = picked.map((i) => `${i.qty} ${i.nameEn}`).join(", ");
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

/** Imagen model id — confirm it is enabled on the project's API key. */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";

export function buildImagenEndpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`;
}

export function buildImagenRequest(prompt: string) {
  return {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: "1:1" },
  };
}

export function extractImagenImage(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const preds = (json as { predictions?: unknown }).predictions;
  if (!Array.isArray(preds) || preds.length === 0) return null;
  const first = preds[0] as { bytesBase64Encoded?: unknown };
  return typeof first?.bytesBase64Encoded === "string"
    ? first.bytesBase64Encoded
    : null;
}
