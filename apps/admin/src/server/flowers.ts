import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  listAdminSpeciesWithVariants,
  tryCreateDb,
  upsertFlowerSpecies,
  upsertFlowerVariant,
  patchVariantImagePath,
  type FlowerSpeciesWithVariants,
  type UpsertSpeciesInput,
  type UpsertVariantInput,
} from "@flowers/api";
import { createSupabaseServerClient } from "@flowers/auth";
import { resolveAdminSession } from "./session";

export type { FlowerSpeciesWithVariants };

async function requireAdmin() {
  const session = await resolveAdminSession();
  if (
    session.kind === "anonymous" ||
    session.kind === "config_error" ||
    session.kind === "forbidden"
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

export const getAdminFlowers = createServerFn({ method: "GET" }).handler(
  async (): Promise<FlowerSpeciesWithVariants[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    const { SUPABASE_URL } = getEnv();
    if (!SUPABASE_URL) return [];
    return listAdminSpeciesWithVariants(db, SUPABASE_URL);
  },
);

export const saveFlowerSpecies = createServerFn({ method: "POST" })
  .validator((d: UpsertSpeciesInput) => d)
  .handler(async ({ data }): Promise<void> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("DB unavailable");
    await upsertFlowerSpecies(db, data);
  });

export const saveFlowerVariant = createServerFn({ method: "POST" })
  .validator((d: UpsertVariantInput) => d)
  .handler(async ({ data }): Promise<void> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("DB unavailable");
    await upsertFlowerVariant(db, data);
  });

export const uploadVariantImage = createServerFn({ method: "POST" })
  .validator(
    (d: { variantId: string; fileName: string; base64: string; mimeType: string }) => d,
  )
  .handler(async ({ data }): Promise<{ imagePath: string }> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("DB unavailable");
    const env = getEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      throw new Error("Supabase not configured");
    }
    const supabase = createSupabaseServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const imagePath = `flowers/${data.fileName}`;
    const { error } = await supabase.storage
      .from("flower-images")
      .upload(imagePath, bytes, {
        contentType: data.mimeType,
        upsert: true,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    await patchVariantImagePath(db, data.variantId, imagePath);
    return { imagePath };
  });
