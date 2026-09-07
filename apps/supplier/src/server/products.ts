/**
 * Product server functions for the Supplier Portal.
 *
 * Mirrors `server/shops.ts`: resolve the supplier session, fail closed for
 * anonymous / misconfigured requests, simulate success under AUTH_DISABLED, and
 * scope every DB call to the caller's own shop. Image storage paths are resolved
 * to public URLs here (server-only), where `getEnv().SUPABASE_URL` is available,
 * so components never touch Workers env — same approach as web's server/catalog.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  requireDb,
  tryCreateDb,
  getEnv,
  createProduct,
  updateProduct,
  listShopProducts,
  getShopProduct,
  listCategories,
  addProductImage,
  deleteProductImage,
  setPrimaryImage,
  type ActionResult,
  type CreateProductInput,
  type UpdateProductInput,
  type OwnerProductListItem,
  type OwnerProductDetail,
  type OwnerProductImage,
  type CategoryOption,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import { resolveSupplierSession, type SupplierSession } from "./session";

const BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ---------------------------------------------------------------------------
// DTOs (image paths resolved to public URLs)
// ---------------------------------------------------------------------------

export type OwnerProductListItemDTO = Omit<
  OwnerProductListItem,
  "primaryImagePath"
> & { imageUrl: string | null };

export interface OwnerProductImageDTO {
  id: string;
  url: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export type OwnerProductDetailDTO = Omit<OwnerProductDetail, "images"> & {
  images: OwnerProductImageDTO[];
};

// ---------------------------------------------------------------------------
// Helpers (server-only)
// ---------------------------------------------------------------------------

/** Resolve a stored image path to a public URL (bucket-relative keys only). */
function resolveImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }
  const { SUPABASE_URL } = getEnv();
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

function toListDTO(item: OwnerProductListItem): OwnerProductListItemDTO {
  const { primaryImagePath, ...rest } = item;
  return { ...rest, imageUrl: resolveImageUrl(primaryImagePath) };
}

function toImageDTO(img: OwnerProductImage): OwnerProductImageDTO {
  return {
    id: img.id,
    url: resolveImageUrl(img.storagePath),
    altText: img.altText,
    sortOrder: img.sortOrder,
    isPrimary: img.isPrimary,
  };
}

/** The owner's shop id, or null when the session cannot act on a real shop. */
function shopIdOf(session: SupplierSession): string | null {
  return session.kind === "supplier" && session.shopId
    ? session.shopId
    : null;
}

function authError<T>(): ActionResult<T> {
  return { ok: false, code: "auth_required", message: "You must be signed in." };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listCategoriesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryOption[]> => {
    const db = tryCreateDb();
    if (!db) return [];
    try {
      return await listCategories(db);
    } catch {
      return [];
    }
  },
);

export const listShopProductsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnerProductListItemDTO[]> => {
    const session = await resolveSupplierSession();
    const shopId = shopIdOf(session);
    if (!shopId) return [];
    const db = tryCreateDb();
    if (!db) return [];
    try {
      const items = await listShopProducts(db, shopId);
      return items.map(toListDTO);
    } catch {
      return [];
    }
  },
);

export const getShopProductFn = createServerFn({ method: "GET" })
  .validator((productId: string) => productId)
  .handler(async ({ data: productId }): Promise<OwnerProductDetailDTO | null> => {
    const session = await resolveSupplierSession();
    const shopId = shopIdOf(session);
    if (!shopId) return null;
    const db = tryCreateDb();
    if (!db) return null;
    try {
      const product = await getShopProduct(db, shopId, productId);
      if (!product) return null;
      const { images, ...rest } = product;
      return { ...rest, images: images.map(toImageDTO) };
    } catch {
      return null;
    }
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createProductFn = createServerFn({ method: "POST" })
  .validator((input: CreateProductInput) => input)
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; slug: string }>> => {
      const session = await resolveSupplierSession();
      if (session.kind === "anonymous" || session.kind === "config_error") {
        return authError();
      }
      if (session.kind === "auth_disabled") {
        return { ok: true, data: { id: "dev-product-id", slug: "dev-product" } };
      }
      const shopId = shopIdOf(session);
      if (!shopId) {
        return { ok: false, code: "not_found", message: "You do not have a shop yet." };
      }
      const db = requireDb();
      return createProduct(db, shopId, data);
    },
  );

export interface UpdateProductArgs {
  productId: string;
  patch: UpdateProductInput;
}

export const updateProductFn = createServerFn({ method: "POST" })
  .validator((input: UpdateProductArgs) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return authError();
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: { id: data.productId } };
    }
    const shopId = shopIdOf(session);
    if (!shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }
    const db = requireDb();
    return updateProduct(db, shopId, data.productId, data.patch);
  });

export const uploadProductImageFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected multipart form data.");
    }
    return data;
  })
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; url: string | null }>> => {
      const session = await resolveSupplierSession();
      if (session.kind === "anonymous" || session.kind === "config_error") {
        return authError();
      }
      if (session.kind === "auth_disabled") {
        return { ok: true, data: { id: "dev-image-id", url: null } };
      }
      const shopId = shopIdOf(session);
      if (!shopId) {
        return { ok: false, code: "not_found", message: "You do not have a shop yet." };
      }

      const productId = data.get("productId");
      const file = data.get("file");
      if (typeof productId !== "string" || !productId) {
        return { ok: false, code: "validation", message: "Missing product." };
      }
      if (!(file instanceof File)) {
        return { ok: false, code: "validation", message: "No file was uploaded." };
      }
      const ext = ALLOWED_IMAGE_TYPES[file.type];
      if (!ext) {
        return { ok: false, code: "validation", message: "Image must be JPEG, PNG, or WebP." };
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return { ok: false, code: "validation", message: "Image must be 5 MB or smaller." };
      }

      const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false, code: "unknown", message: "Image storage is not configured." };
      }

      const db = requireDb();
      const admin = createSupabaseAdminClient({
        url: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      });

      const path = `${shopId}/${productId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        return { ok: false, code: "unknown", message: uploadError.message };
      }

      const result = await addProductImage(db, shopId, productId, {
        storagePath: path,
      });
      if (!result.ok) {
        // Roll back the orphaned storage object if the DB insert failed.
        await admin.storage.from(BUCKET).remove([path]);
        return result;
      }

      return { ok: true, data: { id: result.data.id, url: resolveImageUrl(path) } };
    },
  );

export const deleteProductImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return authError();
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: { id: data.imageId } };
    }
    const shopId = shopIdOf(session);
    if (!shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }

    const db = requireDb();
    const result = await deleteProductImage(db, shopId, data.imageId);
    if (!result.ok) return result;

    // Best-effort removal of the storage object (row is already gone).
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createSupabaseAdminClient({
        url: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      });
      await admin.storage.from(BUCKET).remove([result.data.storagePath]);
    }

    return { ok: true, data: { id: result.data.id } };
  });

export const setPrimaryImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return authError();
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: { id: data.imageId } };
    }
    const shopId = shopIdOf(session);
    if (!shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }
    const db = requireDb();
    return setPrimaryImage(db, shopId, data.imageId);
  });
