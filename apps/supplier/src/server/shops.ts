/**
 * Shop server functions for the Supplier Portal.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  requireDb,
  createShop,
  getShopByOwner,
  updateShop,
  markInviteAccepted,
  setShopMedia,
  type CreateShopInput,
  type UpdateShopInput,
  type ActionResult,
  type SellerType,
  type ShopMediaKind,
  type VerificationStatus,
} from "@flowers/api";
import { createSupabaseAdminClient } from "@flowers/auth";
import { resolveSupplierSession } from "./session";

type CreateShopPayload = CreateShopInput & { inviteToken?: string | null };

export const createShopFn = createServerFn({ method: "POST" })
  .validator((input: CreateShopPayload) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string; slug: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (session.kind === "auth_disabled") {
      // Dev mode: simulate success without hitting the DB.
      return { ok: true, data: { id: "dev-shop-id", slug: "dev-shop" } };
    }

    const { inviteToken, ...shopInput } = data;
    const db = requireDb();
    const result = await createShop(db, session.userId, shopInput);
    // Link the invite (best-effort) so acceptance is tracked for attribution.
    if (result.ok && inviteToken) {
      await markInviteAccepted(db, inviteToken, result.data.id);
    }
    return result;
  });

export const updateShopFn = createServerFn({ method: "POST" })
  .validator((input: UpdateShopInput) => input)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    const session = await resolveSupplierSession();
    if (session.kind === "anonymous" || session.kind === "config_error") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (session.kind === "auth_disabled") {
      return { ok: true, data: { id: "dev-shop-id" } };
    }
    if (session.kind === "no_shop") {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }

    const db = requireDb();
    return updateShop(db, session.userId, data);
  });

// ---------------------------------------------------------------------------
// Shop profile (settings page)
// ---------------------------------------------------------------------------

const BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Resolve a bucket-relative storage path to a public URL (server-only). */
function resolveImageUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }
  const { SUPABASE_URL } = getEnv();
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export interface MyShopDTO {
  slug: string;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  district: string;
  city: string | null;
  sellerTypes: SellerType[];
  verificationStatus: VerificationStatus;
  logoUrl: string | null;
  bannerUrl: string | null;
  /** Public storefront on the buyer site. */
  storefrontUrl: string;
}

/** The signed-in supplier's full shop profile (null when there is none). */
export const getMyShopFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyShopDTO | null> => {
    const session = await resolveSupplierSession();
    if (session.kind !== "supplier") return null;
    const shop = await getShopByOwner(requireDb(), session.userId);
    if (!shop) return null;
    return {
      slug: shop.slug,
      nameEn: shop.nameEn,
      nameSi: shop.nameSi,
      descriptionEn: shop.descriptionEn,
      descriptionSi: shop.descriptionSi,
      district: shop.district,
      city: shop.city,
      sellerTypes: shop.sellerTypes,
      verificationStatus: shop.verificationStatus,
      logoUrl: resolveImageUrl(shop.logoPath),
      bannerUrl: resolveImageUrl(shop.bannerPath),
      storefrontUrl: `${(getEnv().WEB_PUBLIC_URL ?? "https://flowermarket.lk").replace(/\/$/, "")}/en/shops/${shop.slug}`,
    };
  },
);

function isMediaKind(value: unknown): value is ShopMediaKind {
  return value === "logo" || value === "banner";
}

function storageAdmin() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseAdminClient({
    url: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  });
}

/** Upload a shop logo or banner (multipart: kind, file). Replaces the old one. */
export const uploadShopImageFn = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected multipart form data.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ActionResult<{ url: string | null }>> => {
    const session = await resolveSupplierSession();
    if (session.kind !== "supplier") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (!session.shopId) {
      return { ok: false, code: "not_found", message: "You do not have a shop yet." };
    }
    const kind = data.get("kind");
    const file = data.get("file");
    if (!isMediaKind(kind)) {
      return { ok: false, code: "validation", message: "Unknown image kind." };
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
    const admin = storageAdmin();
    if (!admin) {
      return { ok: false, code: "unknown", message: "Image storage is not configured." };
    }

    const path = `${session.shopId}/shop/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false, code: "unknown", message: error.message };

    const result = await setShopMedia(requireDb(), session.userId, kind, path);
    if (!result.ok) {
      await admin.storage.from(BUCKET).remove([path]);
      return result;
    }
    const previous = result.data.previousPath;
    if (previous && !/^https?:\/\//.test(previous) && !previous.startsWith("/")) {
      // Best-effort cleanup of the replaced object.
      await admin.storage.from(BUCKET).remove([previous]);
    }
    return { ok: true, data: { url: resolveImageUrl(path) } };
  });

/** Remove the shop logo or banner. */
export const removeShopImageFn = createServerFn({ method: "POST" })
  .validator((input: { kind: ShopMediaKind }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ url: null }>> => {
    const session = await resolveSupplierSession();
    if (session.kind !== "supplier") {
      return { ok: false, code: "auth_required", message: "You must be signed in." };
    }
    if (!isMediaKind(data.kind)) {
      return { ok: false, code: "validation", message: "Unknown image kind." };
    }
    const result = await setShopMedia(requireDb(), session.userId, data.kind, null);
    if (!result.ok) return result;
    const previous = result.data.previousPath;
    const admin = storageAdmin();
    if (admin && previous && !/^https?:\/\//.test(previous) && !previous.startsWith("/")) {
      await admin.storage.from(BUCKET).remove([previous]);
    }
    return { ok: true, data: { url: null } };
  });
