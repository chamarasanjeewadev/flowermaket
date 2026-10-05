/** AI bouquet image generation (server-only). Includes rate limiting, Supabase
 * Storage upload, and DB tracking. Never throws to the client — always returns
 * a discriminated result. */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getEnv, tryCreateDb, checkBouquetRateLimit, recordBouquetGeneration } from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  resolveBouquetModel,
  type BouquetModelChoice,
  type BouquetPromptItem,
} from "@flowers/integrations";
import { resolveSessionUser } from "./session";

export type GenerateBouquetResult =
  | { ok: true; dataUrl: string; imageUrl: string | null }
  | { ok: false; reason: "unconfigured" | "empty" | "api_error" }
  | { ok: false; reason: "rate_limited"; limitKind: "anon_limit" | "user_limit" | "cooloff"; resetAt?: string };

export interface GenerateBouquetInput {
  items: BouquetPromptItem[];
  /** Show the bouquet held by a model look; "none"/omitted = product-only shot. */
  model?: BouquetModelChoice;
}

function resolveIp(): string {
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export const generateBouquetImage = createServerFn({ method: "POST" })
  .validator((data: GenerateBouquetInput) => data)
  .handler(async ({ data }): Promise<GenerateBouquetResult> => {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) return { ok: false, reason: "unconfigured" };

    const prompt = buildBouquetPrompt(data.items, "en", {
      model: resolveBouquetModel(data.model),
    });
    if (!prompt) return { ok: false, reason: "empty" };

    const session = await resolveSessionUser();
    const userId =
      session.kind === "authenticated" ? session.userId : null;
    const ipAddress = resolveIp();

    const db = tryCreateDb();
    if (db) {
      try {
        const check = await checkBouquetRateLimit(db, { userId, ipAddress });
        if (!check.allowed) {
          return {
            ok: false,
            reason: "rate_limited",
            limitKind: check.reason,
            resetAt: check.resetAt?.toISOString(),
          };
        }
      } catch {
        // DB unavailable — skip rate limiting rather than blocking generation
      }
    }

    let img: { data: string; mimeType: string } | null = null;
    try {
      const res = await fetch(buildImagenEndpoint(env.GEMINI_API_KEY), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildImagenRequest(prompt)),
      });
      if (!res.ok) return { ok: false, reason: "api_error" };
      img = extractImagenImage(await res.json());
      if (!img) return { ok: false, reason: "api_error" };
    } catch {
      return { ok: false, reason: "api_error" };
    }

    const dataUrl = `data:${img.mimeType};base64,${img.data}`;

    // Try to upload to Supabase Storage so we can share a public URL.
    let imageStoragePath: string | null = null;
    let imagePublicUrl: string | null = null;

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createSupabaseAdminClient({
          url: env.SUPABASE_URL,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        });
        const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
        const ext = img.mimeType === "image/png" ? "png" : "jpg";
        const path = `designs/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("bouquet-designs")
          .upload(path, bytes, {
            contentType: img.mimeType,
            upsert: false,
          });
        if (!error) {
          imageStoragePath = path;
          imagePublicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/bouquet-designs/${path}`;
        }
      } catch {
        // Storage upload is best-effort — generation still succeeds
      }
    }

    if (db) {
      try {
        await recordBouquetGeneration(db, {
          userId,
          ipAddress,
          flowersJson: JSON.stringify(data.items),
          imageStoragePath,
          imagePublicUrl,
        });
      } catch {
        // DB record failure should not block the user
      }
    }

    return { ok: true, dataUrl, imageUrl: imagePublicUrl };
  });
