/**
 * Product moderation — admin review of supplier listings.
 *
 * Only products with `moderation_status = 'approved'` (and `status = 'active'`)
 * are public (see `publicConditions()` in repos/catalog.ts). Owner-created
 * products start `pending`; owner edits to customer-facing content send an
 * approved product back to `pending`; only an admin can unblock.
 *
 * Pure transition helpers are exported for unit tests (moderation.test.ts).
 */
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";
import { err, ok, type ActionResult } from "../errors";
import type { SellerType } from "../constants";
import type { ListingType } from "./catalog";
import type { ProductStatus, UpdateProductInput } from "./products";

export type ModerationStatus = "pending" | "approved" | "blocked";

/** Who is making a change: the shop owner, or an admin (incl. "manage as owner"). */
export type ProductActor = "owner" | "admin";

// ---------------------------------------------------------------------------
// Pure transitions
// ---------------------------------------------------------------------------

/** Fields buyers see; changing any of them needs re-review. */
const REVIEWED_FIELDS = [
  "categoryId",
  "nameEn",
  "nameSi",
  "descriptionEn",
  "descriptionSi",
  "price",
  "compareAtPrice",
  "listingType",
] as const satisfies ReadonlyArray<keyof UpdateProductInput>;

export function initialModeration(actor: ProductActor): ModerationStatus {
  return actor === "admin" ? "approved" : "pending";
}

export function nextModerationOnEdit(
  current: ModerationStatus,
  patch: UpdateProductInput,
  actor: ProductActor,
): ModerationStatus {
  if (actor === "admin" || current !== "approved") return current;
  const touchesReviewed = REVIEWED_FIELDS.some((field) => field in patch);
  return touchesReviewed ? "pending" : current;
}

export function nextModerationOnImageAdd(
  current: ModerationStatus,
  actor: ProductActor,
): ModerationStatus {
  if (actor === "admin" || current !== "approved") return current;
  return "pending";
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export interface ModerationListFilter {
  moderation?: ModerationStatus;
  shopId?: string;
  q?: string;
}

export interface ModerationProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  price: number;
  compareAtPrice: number | null;
  listingType: ListingType;
  minOrderQty: number | null;
  stockQty: number | null;
  status: ProductStatus;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  moderatedAt: Date | null;
  categoryNameEn: string;
  shopId: string;
  shopSlug: string;
  shopNameEn: string;
  shopSellerTypes: SellerType[];
  shopVerificationStatus: "unverified" | "pending" | "verified" | "rejected";
  /** All image storage paths, primary first. */
  imagePaths: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Every product (any shop, any state) for the admin moderation screen. */
export async function listProductsForModeration(
  db: Db,
  filter: ModerationListFilter = {},
): Promise<ModerationProduct[]> {
  const conditions: SQL[] = [];
  if (filter.moderation) {
    conditions.push(eq(schema.products.moderationStatus, filter.moderation));
  }
  if (filter.shopId) conditions.push(eq(schema.products.shopId, filter.shopId));
  const q = filter.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const match = or(
      ilike(schema.products.nameEn, like),
      ilike(schema.products.nameSi, like),
      ilike(schema.shops.nameEn, like),
    );
    if (match) conditions.push(match);
  }

  const rows = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      nameEn: schema.products.nameEn,
      nameSi: schema.products.nameSi,
      descriptionEn: schema.products.descriptionEn,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      listingType: schema.products.listingType,
      minOrderQty: schema.products.minOrderQty,
      stockQty: schema.products.stockQty,
      status: schema.products.status,
      moderationStatus: schema.products.moderationStatus,
      moderationNote: schema.products.moderationNote,
      moderatedAt: schema.products.moderatedAt,
      categoryNameEn: schema.categories.nameEn,
      shopId: schema.shops.id,
      shopSlug: schema.shops.slug,
      shopNameEn: schema.shops.nameEn,
      shopSellerTypes: schema.shops.sellerTypes,
      shopVerificationStatus: schema.shops.verificationStatus,
      createdAt: schema.products.createdAt,
      updatedAt: schema.products.updatedAt,
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.products.updatedAt))
    .limit(500);

  const images = rows.length
    ? await db
        .select({
          productId: schema.productImages.productId,
          storagePath: schema.productImages.storagePath,
        })
        .from(schema.productImages)
        .where(
          inArray(
            schema.productImages.productId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(
          desc(schema.productImages.isPrimary),
          schema.productImages.sortOrder,
        )
    : [];

  const byProduct = new Map<string, string[]>();
  for (const img of images) {
    const list = byProduct.get(img.productId) ?? [];
    list.push(img.storagePath);
    byProduct.set(img.productId, list);
  }

  return rows.map((r) => ({ ...r, imagePaths: byProduct.get(r.id) ?? [] }));
}

export interface ModerationCounts {
  pending: number;
  approved: number;
  blocked: number;
}

export async function moderationCounts(db: Db): Promise<ModerationCounts> {
  const rows = await db
    .select({
      moderationStatus: schema.products.moderationStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.products)
    .groupBy(schema.products.moderationStatus);
  const counts: ModerationCounts = { pending: 0, approved: 0, blocked: 0 };
  for (const row of rows) counts[row.moderationStatus] = row.count;
  return counts;
}

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

/** Approve / block / re-queue a product. A block should carry a reason. */
export async function moderateProduct(
  db: Db,
  productId: string,
  adminUserId: string | null,
  status: ModerationStatus,
  note?: string | null,
): Promise<ActionResult<{ id: string; moderationStatus: ModerationStatus }>> {
  if (status !== "pending" && status !== "approved" && status !== "blocked") {
    return err("validation", "Invalid moderation status.");
  }
  try {
    const [row] = await db
      .update(schema.products)
      .set({
        moderationStatus: status,
        moderationNote: status === "approved" ? null : (note?.trim() || null),
        moderatedAt: new Date(),
        moderatedBy: adminUserId,
      })
      .where(eq(schema.products.id, productId))
      .returning({ id: schema.products.id });
    if (!row) return err("not_found", "Product not found.");
    return ok({ id: row.id, moderationStatus: status });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not update moderation.",
    );
  }
}

/** Approve many products at once (e.g. "approve all from this shop"). */
export async function approveProducts(
  db: Db,
  productIds: string[],
  adminUserId: string | null,
): Promise<ActionResult<{ count: number }>> {
  if (productIds.length === 0) return ok({ count: 0 });
  try {
    const rows = await db
      .update(schema.products)
      .set({
        moderationStatus: "approved",
        moderationNote: null,
        moderatedAt: new Date(),
        moderatedBy: adminUserId,
      })
      .where(inArray(schema.products.id, productIds))
      .returning({ id: schema.products.id });
    return ok({ count: rows.length });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not approve products.",
    );
  }
}
