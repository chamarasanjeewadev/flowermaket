/** AI bouquet image generation (server-only). Lazily reads GEMINI_API_KEY and
 * calls Google's Imagen :predict endpoint via fetch. All testable logic lives
 * in @flowers/integrations; this file is the thin Workers wire. Never throws to
 * the client — always returns a discriminated result. */
import { createServerFn } from "@tanstack/react-start";
import { getEnv } from "@flowers/api";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  type BouquetPromptItem,
} from "@flowers/integrations";

export type GenerateBouquetResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "unconfigured" | "empty" | "api_error" };

export interface GenerateBouquetInput {
  items: BouquetPromptItem[];
}

export const generateBouquetImage = createServerFn({ method: "POST" })
  .validator((data: GenerateBouquetInput) => data)
  .handler(async ({ data }): Promise<GenerateBouquetResult> => {
    const { GEMINI_API_KEY } = getEnv();
    if (!GEMINI_API_KEY) return { ok: false, reason: "unconfigured" };

    const prompt = buildBouquetPrompt(data.items, "en");
    if (!prompt) return { ok: false, reason: "empty" };

    try {
      const res = await fetch(buildImagenEndpoint(GEMINI_API_KEY), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildImagenRequest(prompt)),
      });
      if (!res.ok) return { ok: false, reason: "api_error" };
      const b64 = extractImagenImage(await res.json());
      if (!b64) return { ok: false, reason: "api_error" };
      return { ok: true, dataUrl: `data:image/png;base64,${b64}` };
    } catch {
      return { ok: false, reason: "api_error" };
    }
  });
