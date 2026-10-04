import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import {
  getEnv,
  tryCreateDb,
  checkBouquetRateLimit,
  recordBouquetGeneration,
  listDesignerFlowers as repoListDesignerFlowers,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import {
  buildBouquetPrompt,
  buildImagenEndpoint,
  buildImagenRequest,
  extractImagenImage,
  type BouquetPromptItem,
} from "@flowers/integrations";
import { resolveAdminSession } from "./session";

export interface DesignerFlowerDTO {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  imageUrl: string | null;
}

export type GenerateBouquetResult =
  | { ok: true; dataUrl: string; imageUrl: string | null }
  | { ok: false; reason: "unconfigured" | "empty" | "api_error" | "unauthorized" }
  | { ok: false; reason: "rate_limited"; resetAt?: string };

export interface GenerateBouquetInput {
  items: BouquetPromptItem[];
}

function resolveIp(): string {
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function resolveImageUrl(storagePath: string | null, supabaseUrl: string): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) return storagePath;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/product-images/${storagePath}`;
}

export const listDesignerFlowersAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<DesignerFlowerDTO[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    const { SUPABASE_URL } = getEnv();
    const rows = await repoListDesignerFlowers(db);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      nameEn: r.nameEn,
      nameSi: r.nameSi,
      imageUrl: resolveImageUrl(r.primaryImagePath, SUPABASE_URL ?? ""),
    }));
  },
);

export const generateBouquetImageAdmin = createServerFn({ method: "POST" })
  .validator((data: GenerateBouquetInput) => data)
  .handler(async ({ data }): Promise<GenerateBouquetResult> => {
    const session = await resolveAdminSession();
    if (
      session.kind === "anonymous" ||
      session.kind === "config_error" ||
      session.kind === "forbidden"
    ) {
      return { ok: false, reason: "unauthorized" };
    }

    const env = getEnv();
    if (!env.GEMINI_API_KEY) return { ok: false, reason: "unconfigured" };

    const prompt = buildBouquetPrompt(data.items, "en");
    if (!prompt) return { ok: false, reason: "empty" };

    const userId = session.kind === "admin" ? session.userId : null;
    const ipAddress = resolveIp();

    const db = tryCreateDb();
    if (db) {
      try {
        const check = await checkBouquetRateLimit(db, { userId, ipAddress });
        // Admin bypasses daily user_limit — only the cooloff window applies.
        if (!check.allowed && check.reason === "cooloff") {
          return {
            ok: false,
            reason: "rate_limited",
            resetAt: check.resetAt?.toISOString(),
          };
        }
      } catch {
        // DB unavailable — skip rate limiting
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
          .upload(path, bytes, { contentType: img.mimeType, upsert: false });
        if (!error) {
          imageStoragePath = path;
          imagePublicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/bouquet-designs/${path}`;
        }
      } catch {
        // Storage upload is best-effort
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
        // DB record failure should not block generation
      }
    }

    return { ok: true, dataUrl, imageUrl: imagePublicUrl };
  });
