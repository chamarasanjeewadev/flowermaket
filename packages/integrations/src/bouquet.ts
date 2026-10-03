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

/** Gemini image generation model. */
export const IMAGEN_MODEL = "gemini-3.1-flash-image";

export function buildImagenEndpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:generateContent?key=${apiKey}`;
}

export function buildImagenRequest(prompt: string) {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
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
