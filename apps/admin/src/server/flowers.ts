import { createServerFn } from "@tanstack/react-start";
import {
  deleteFlowerCategory,
  getEnv,
  listAdminSpeciesWithVariants,
  listFlowerCategories,
  upsertFlowerCategory,
  tryCreateDb,
  upsertFlowerSpecies,
  upsertFlowerVariant,
  patchVariantImagePath,
  type FlowerCategoryWithCount,
  type FlowerSpeciesWithVariants,
  type UpsertFlowerCategoryInput,
  type UpsertSpeciesInput,
  type UpsertVariantInput,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import { resolveAdminSession } from "./session";

export type { FlowerCategoryWithCount, FlowerSpeciesWithVariants };

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
    // A missing SUPABASE_URL only breaks image URLs — still list the catalog
    // (image fields fall back to null) rather than hiding every flower.
    const { SUPABASE_URL } = getEnv();
    return listAdminSpeciesWithVariants(db, SUPABASE_URL ?? "");
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

const BUCKET = "flower-images";
const ALLOWED_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};
/** ~5 MB decoded — matches the bucket's file_size_limit (migration 0022). */
const MAX_BYTES = 5 * 1024 * 1024;

function adminStorage() {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Photo upload isn't configured: set the SUPABASE_SERVICE_ROLE_KEY secret on the admin worker.",
    );
  }
  // Storage writes require the service-role client (bypasses storage RLS).
  const supabase = createSupabaseAdminClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return { supabase, supabaseUrl: env.SUPABASE_URL };
}

export const uploadVariantImage = createServerFn({ method: "POST" })
  .validator((d: { variantId: string; base64: string; mimeType: string }) => d)
  .handler(async ({ data }): Promise<{ imagePath: string; imageUrl: string }> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("Database unavailable — try again shortly.");
    const ext = ALLOWED_MIME[data.mimeType];
    if (!ext) throw new Error("Use a JPEG, PNG or WebP photo.");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("Photo is larger than 5 MB even after compression.");
    }
    const { supabase, supabaseUrl } = adminStorage();

    // Never use the user's file name as the key: macOS screenshot names contain
    // U+202F / spaces / brackets that Storage rejects ("Invalid key"). A fresh
    // key per upload also busts the public CDN cache on "replace photo".
    const safeId = data.variantId.replace(/[^a-zA-Z0-9-]/g, "-");
    const imagePath = `${safeId}/${Date.now()}.${ext}`;
    const upload = () =>
      supabase.storage
        .from(BUCKET)
        .upload(imagePath, bytes, { contentType: data.mimeType, upsert: true });

    let { error } = await upload();
    if (error && /bucket not found/i.test(error.message)) {
      // First upload on a fresh project — create the public bucket and retry.
      await supabase.storage.createBucket(BUCKET, { public: true });
      ({ error } = await upload());
    }
    if (error) throw new Error(`Storage rejected the photo: ${error.message}`);

    await patchVariantImagePath(db, data.variantId, imagePath);
    return {
      imagePath,
      imageUrl: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${imagePath}`,
    };
  });

export const removeVariantImage = createServerFn({ method: "POST" })
  .validator((d: { variantId: string; imagePath: string | null }) => d)
  .handler(async ({ data }): Promise<void> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("Database unavailable — try again shortly.");
    await patchVariantImagePath(db, data.variantId, null);
    if (data.imagePath) {
      // Best effort — an orphaned object is harmless, a stuck DB row is not.
      try {
        const { supabase } = adminStorage();
        await supabase.storage.from(BUCKET).remove([data.imagePath]);
      } catch {
        /* ignore */
      }
    }
  });

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const getFlowerCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<FlowerCategoryWithCount[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    return listFlowerCategories(db);
  },
);

export const saveFlowerCategory = createServerFn({ method: "POST" })
  .validator((d: UpsertFlowerCategoryInput) => d)
  .handler(async ({ data }): Promise<void> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("Database unavailable — try again shortly.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
      throw new Error("Category key must be lowercase letters, numbers and dashes.");
    }
    if (!data.nameEn.trim()) throw new Error("English name is required.");
    await upsertFlowerCategory(db, { ...data, nameEn: data.nameEn.trim() });
  });

export const removeFlowerCategory = createServerFn({ method: "POST" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<void> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) throw new Error("Database unavailable — try again shortly.");
    const ok = await deleteFlowerCategory(db, data.slug);
    if (!ok) {
      throw new Error("This category is used by species — move them first, or hide it instead.");
    }
  });
