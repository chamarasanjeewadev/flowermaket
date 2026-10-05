/**
 * Product moderation server functions for the Admin Portal: list every product
 * (any shop / state), approve, block (with a reason) or re-queue.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  approveProducts,
  getEnv,
  listProductsForModeration,
  moderateProduct,
  moderationCounts,
  tryCreateDb,
  type ActionResult,
  type ModerationCounts,
  type ModerationListFilter,
  type ModerationProduct,
  type ModerationStatus,
} from "@flowers/api";
import { resolveAdminSession } from "./session";

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

/** Resolve a stored image path to a public URL (server-only). */
function resolveImageUrl(storagePath: string): string | null {
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }
  const { SUPABASE_URL } = getEnv();
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/product-images/${storagePath}`;
}

export type ModerationProductDTO = Omit<ModerationProduct, "imagePaths"> & {
  imageUrls: string[];
};

export interface ModerationPageData {
  products: ModerationProductDTO[];
  counts: ModerationCounts;
  /** Origins used to build storefront / "manage as owner" links. */
  webUrl: string;
  supplierPortalUrl: string | null;
}

export const listModerationProductsFn = createServerFn({ method: "GET" })
  .validator((input: ModerationListFilter) => input)
  .handler(async ({ data }): Promise<ModerationPageData> => {
    await requireAdmin();
    const env = getEnv();
    const urls = {
      webUrl: (env.WEB_PUBLIC_URL ?? "https://flowermarket.lk").replace(/\/$/, ""),
      supplierPortalUrl: env.SUPPLIER_PORTAL_URL?.replace(/\/$/, "") ?? null,
    };
    const db = tryCreateDb();
    if (!db) {
      return { products: [], counts: { pending: 0, approved: 0, blocked: 0 }, ...urls };
    }
    const [rows, counts] = await Promise.all([
      listProductsForModeration(db, data),
      moderationCounts(db),
    ]);
    return {
      products: rows.map(({ imagePaths, ...rest }) => ({
        ...rest,
        imageUrls: imagePaths
          .map(resolveImageUrl)
          .filter((u): u is string => u !== null),
      })),
      counts,
      ...urls,
    };
  });

export const getModerationCountsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ModerationCounts> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return { pending: 0, approved: 0, blocked: 0 };
    return moderationCounts(db);
  },
);

export const moderateProductFn = createServerFn({ method: "POST" })
  .validator(
    (input: { productId: string; status: ModerationStatus; note?: string | null }) =>
      input,
  )
  .handler(
    async ({ data }): Promise<ActionResult<{ id: string; moderationStatus: ModerationStatus }>> => {
      const session = await requireAdmin();
      const db = tryCreateDb();
      if (!db) {
        return { ok: false, code: "db_unavailable", message: "Database is not configured." };
      }
      if (data.status === "blocked" && !data.note?.trim()) {
        return {
          ok: false,
          code: "validation",
          message: "Add a reason so the seller knows what to fix.",
        };
      }
      const adminId = session.kind === "admin" ? session.userId : null;
      return moderateProduct(db, data.productId, adminId, data.status, data.note);
    },
  );

export const approveProductsFn = createServerFn({ method: "POST" })
  .validator((input: { productIds: string[] }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ count: number }>> => {
    const session = await requireAdmin();
    const db = tryCreateDb();
    if (!db) {
      return { ok: false, code: "db_unavailable", message: "Database is not configured." };
    }
    const adminId = session.kind === "admin" ? session.userId : null;
    return approveProducts(db, data.productIds, adminId);
  });

/** Origins the admin UI needs for outbound links (storefront, manage as owner). */
export const getPortalUrlsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ webUrl: string; supplierPortalUrl: string | null }> => {
    await requireAdmin();
    const env = getEnv();
    return {
      webUrl: (env.WEB_PUBLIC_URL ?? "https://flowermarket.lk").replace(/\/$/, ""),
      supplierPortalUrl: env.SUPPLIER_PORTAL_URL?.replace(/\/$/, "") ?? null,
    };
  },
);
