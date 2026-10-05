/**
 * Public catalog repo — read-only data access for the buyer-facing marketplace.
 *
 * Every read enforces the public visibility rule:
 *   products.status = 'active'
 *   AND shops.verification_status = 'verified'
 *   AND shops.is_active = true
 *
 * Follows the data-layer conventions in `repos/shops.ts`: `db` first arg,
 * `import { schema } from "@flowers/db/client"`, plain typed return values
 * (reads return rows / null, never throw for "not found").
 *
 * Server-only — never import this (or the @flowers/api barrel) from client
 * bundles; it pulls the postgres driver. Route loaders reach it via the
 * server functions in `apps/web/src/server/catalog.ts`.
 */
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import { DESIGNER_CATEGORY_SLUGS, type SellerType } from "../constants";
import type { Db } from "../db";

export const CATALOG_PAGE_SIZE = 24;

export type ListingType = "retail" | "wholesale";

export interface ProductListItem {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  price: number;
  compareAtPrice: number | null;
  listingType: ListingType;
  minOrderQty: number | null;
  stockQty: number | null;
  leadTimeDays: number | null;
  /** Raw storage path of the primary image (resolve to a URL server-side). */
  primaryImagePath: string | null;
  shopSlug: string;
  shopNameEn: string;
  shopNameSi: string | null;
  shopSellerTypes: SellerType[];
  categorySlug: string;
  flowerVariantId: string | null;
}

export interface ProductImageRow {
  storagePath: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ShopSummary {
  slug: string;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  district: string;
  city: string | null;
  sellerTypes: SellerType[];
  /** Raw storage paths (resolve to URLs server-side). */
  logoPath: string | null;
  bannerPath: string | null;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
}

/** A shop in the public directory, with enough product context to preview it. */
export interface ShopDirectoryEntry extends ShopSummary {
  productCount: number;
  /** Up to 4 primary-image storage paths of the shop's newest products. */
  previewImagePaths: string[];
  /** Lowest active product price in LKR cents (null when no products). */
  minPrice: number | null;
}

export interface ListShopsFilter {
  sellerType?: SellerType;
  district?: string;
}

export interface CategorySummary {
  slug: string;
  nameEn: string;
  nameSi: string | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  descriptionEn: string | null;
  descriptionSi: string | null;
  price: number;
  compareAtPrice: number | null;
  stockQty: number | null;
  leadTimeDays: number | null;
  listingType: ListingType;
  minOrderQty: number | null;
  images: ProductImageRow[];
  shop: ShopSummary;
  category: CategorySummary;
}

export interface CategoryWithCount {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  sortOrder: number;
  productCount: number;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListProductsFilter {
  categorySlug?: string;
  listingType?: ListingType;
  district?: string;
  sellerType?: SellerType;
  q?: string;
  page?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map product id → primary image storage path (isPrimary first, then sortOrder). */
async function primaryImagePaths(
  db: Db,
  productIds: string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      productId: schema.productImages.productId,
      storagePath: schema.productImages.storagePath,
    })
    .from(schema.productImages)
    .where(inArray(schema.productImages.productId, productIds))
    .orderBy(
      desc(schema.productImages.isPrimary),
      asc(schema.productImages.sortOrder),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.productId)) map.set(row.productId, row.storagePath);
  }
  return map;
}

/** Select ProductListItem rows for a set of conditions, newest first. */
async function selectListItems(
  db: Db,
  conditions: SQL[],
  opts?: { limit?: number; offset?: number },
): Promise<ProductListItem[]> {
  const rows = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      nameEn: schema.products.nameEn,
      nameSi: schema.products.nameSi,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      listingType: schema.products.listingType,
      minOrderQty: schema.products.minOrderQty,
      stockQty: schema.products.stockQty,
      leadTimeDays: schema.products.leadTimeDays,
      shopSlug: schema.shops.slug,
      shopNameEn: schema.shops.nameEn,
      shopNameSi: schema.shops.nameSi,
      shopSellerTypes: schema.shops.sellerTypes,
      categorySlug: schema.categories.slug,
      flowerVariantId: schema.products.flowerVariantId,
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(and(...conditions))
    .orderBy(desc(schema.products.createdAt))
    .limit(opts?.limit ?? CATALOG_PAGE_SIZE)
    .offset(opts?.offset ?? 0);

  const images = await primaryImagePaths(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    ...r,
    primaryImagePath: images.get(r.id) ?? null,
  }));
}

/** Columns selected for every public ShopSummary. */
function shopSummaryColumns() {
  return {
    slug: schema.shops.slug,
    nameEn: schema.shops.nameEn,
    nameSi: schema.shops.nameSi,
    descriptionEn: schema.shops.descriptionEn,
    descriptionSi: schema.shops.descriptionSi,
    district: schema.shops.district,
    city: schema.shops.city,
    sellerTypes: schema.shops.sellerTypes,
    logoPath: schema.shops.logoPath,
    bannerPath: schema.shops.bannerPath,
    verificationStatus: schema.shops.verificationStatus,
  };
}

/** Conditions that make a product publicly visible. */
function publicConditions(): SQL[] {
  return [
    eq(schema.products.status, "active"),
    eq(schema.shops.verificationStatus, "verified"),
    eq(schema.shops.isActive, true),
  ];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listActiveProducts(
  db: Db,
  filter: ListProductsFilter = {},
): Promise<ProductListResult> {
  const page = Math.max(1, filter.page ?? 1);
  const conditions = publicConditions();

  if (filter.categorySlug) {
    conditions.push(eq(schema.categories.slug, filter.categorySlug));
  }
  if (filter.listingType) {
    conditions.push(eq(schema.products.listingType, filter.listingType));
  }
  if (filter.district) {
    conditions.push(eq(schema.shops.district, filter.district));
  }
  if (filter.sellerType) {
    conditions.push(arrayContains(schema.shops.sellerTypes, [filter.sellerType]));
  }
  const q = filter.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const match = or(
      ilike(schema.products.nameEn, like),
      ilike(schema.products.nameSi, like),
    );
    if (match) conditions.push(match);
  }

  const items = await selectListItems(db, conditions, {
    limit: CATALOG_PAGE_SIZE,
    offset: (page - 1) * CATALOG_PAGE_SIZE,
  });

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(and(...conditions));

  return {
    items,
    total: countRow?.total ?? 0,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  };
}

/** Publicly-visible products in the designer's configured category set,
 * ordered newest-first (via selectListItems). Used by the AI bouquet designer. */
export async function listDesignerFlowers(db: Db): Promise<ProductListItem[]> {
  const conditions: SQL[] = [
    ...publicConditions(),
    inArray(schema.categories.slug, [...DESIGNER_CATEGORY_SLUGS]),
  ];
  return selectListItems(db, conditions, { limit: 200 });
}

export async function getActiveProductBySlug(
  db: Db,
  slug: string,
): Promise<ProductDetail | null> {
  const [row] = await db
    .select({
      product: schema.products,
      shop: shopSummaryColumns(),
      category: {
        slug: schema.categories.slug,
        nameEn: schema.categories.nameEn,
        nameSi: schema.categories.nameSi,
      },
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(and(eq(schema.products.slug, slug), ...publicConditions()))
    .limit(1);

  if (!row) return null;

  const images = await db
    .select({
      storagePath: schema.productImages.storagePath,
      altText: schema.productImages.altText,
      sortOrder: schema.productImages.sortOrder,
      isPrimary: schema.productImages.isPrimary,
    })
    .from(schema.productImages)
    .where(eq(schema.productImages.productId, row.product.id))
    .orderBy(
      desc(schema.productImages.isPrimary),
      asc(schema.productImages.sortOrder),
    );

  return {
    id: row.product.id,
    slug: row.product.slug,
    nameEn: row.product.nameEn,
    nameSi: row.product.nameSi,
    descriptionEn: row.product.descriptionEn,
    descriptionSi: row.product.descriptionSi,
    price: row.product.price,
    compareAtPrice: row.product.compareAtPrice,
    stockQty: row.product.stockQty,
    leadTimeDays: row.product.leadTimeDays,
    listingType: row.product.listingType,
    minOrderQty: row.product.minOrderQty,
    images,
    shop: row.shop,
    category: row.category,
  };
}

export async function getShopWithProducts(
  db: Db,
  slug: string,
): Promise<{ shop: ShopSummary; products: ProductListItem[] } | null> {
  const [shop] = await db
    .select({
      ...shopSummaryColumns(),
    })
    .from(schema.shops)
    .where(
      and(
        eq(schema.shops.slug, slug),
        eq(schema.shops.verificationStatus, "verified"),
        eq(schema.shops.isActive, true),
      ),
    )
    .limit(1);

  if (!shop) return null;

  const products = await selectListItems(
    db,
    [...publicConditions(), eq(schema.shops.slug, slug)],
    { limit: 100 },
  );

  return { shop, products };
}

/** All publicly-visible shops (verified + active) for the /shops directory,
 * with product counts and preview images. Shops with products sort first. */
export async function listActiveShops(
  db: Db,
  filter: ListShopsFilter = {},
): Promise<ShopDirectoryEntry[]> {
  const conditions: SQL[] = [
    eq(schema.shops.verificationStatus, "verified"),
    eq(schema.shops.isActive, true),
  ];
  if (filter.sellerType) {
    conditions.push(arrayContains(schema.shops.sellerTypes, [filter.sellerType]));
  }
  if (filter.district) {
    conditions.push(eq(schema.shops.district, filter.district));
  }

  const shops = await db
    .select({ id: schema.shops.id, ...shopSummaryColumns() })
    .from(schema.shops)
    .where(and(...conditions))
    .orderBy(asc(schema.shops.nameEn));
  if (shops.length === 0) return [];

  const products = await db
    .select({
      id: schema.products.id,
      shopId: schema.products.shopId,
      price: schema.products.price,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.status, "active"),
        inArray(
          schema.products.shopId,
          shops.map((x) => x.id),
        ),
      ),
    )
    .orderBy(desc(schema.products.createdAt));

  const images = await primaryImagePaths(
    db,
    products.map((p) => p.id),
  );

  const stats = new Map<
    string,
    { count: number; previews: string[]; minPrice: number | null }
  >();
  for (const p of products) {
    const st = stats.get(p.shopId) ?? { count: 0, previews: [], minPrice: null };
    st.count += 1;
    st.minPrice = st.minPrice === null ? p.price : Math.min(st.minPrice, p.price);
    const img = images.get(p.id);
    if (img && st.previews.length < 4) st.previews.push(img);
    stats.set(p.shopId, st);
  }

  return shops
    .map(({ id, ...shop }) => {
      const st = stats.get(id);
      return {
        ...shop,
        productCount: st?.count ?? 0,
        previewImagePaths: st?.previews ?? [],
        minPrice: st?.minPrice ?? null,
      };
    })
    .sort((a, b) => Number(b.productCount > 0) - Number(a.productCount > 0));
}

export interface SitemapData {
  products: { slug: string; updatedAt: Date }[];
  shops: { slug: string }[];
  categories: { slug: string }[];
}

/** All publicly-visible product / shop / category slugs for the sitemap. */
export async function listCatalogSitemap(db: Db): Promise<SitemapData> {
  const products = await db
    .select({
      slug: schema.products.slug,
      updatedAt: schema.products.updatedAt,
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .where(and(...publicConditions()));

  const shops = await db
    .select({ slug: schema.shops.slug })
    .from(schema.shops)
    .where(
      and(
        eq(schema.shops.verificationStatus, "verified"),
        eq(schema.shops.isActive, true),
      ),
    );

  const categories = await db
    .select({ slug: schema.categories.slug })
    .from(schema.categories)
    .where(eq(schema.categories.isActive, true));

  return { products, shops, categories };
}

export async function listActiveCategoriesWithCounts(
  db: Db,
): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      nameEn: schema.categories.nameEn,
      nameSi: schema.categories.nameSi,
      sortOrder: schema.categories.sortOrder,
      productCount: sql<number>`count(${schema.shops.id})::int`,
    })
    .from(schema.categories)
    .leftJoin(
      schema.products,
      and(
        eq(schema.products.categoryId, schema.categories.id),
        eq(schema.products.status, "active"),
      ),
    )
    .leftJoin(
      schema.shops,
      and(
        eq(schema.shops.id, schema.products.shopId),
        eq(schema.shops.verificationStatus, "verified"),
        eq(schema.shops.isActive, true),
      ),
    )
    .where(eq(schema.categories.isActive, true))
    .groupBy(
      schema.categories.id,
      schema.categories.slug,
      schema.categories.nameEn,
      schema.categories.nameSi,
      schema.categories.sortOrder,
    )
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.nameEn));

  return rows;
}

/** Category slug → primary image path of its newest publicly-visible product
 * (used as the category tile cover). Categories without images are absent. */
export async function listCategoryCoverImages(
  db: Db,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      productId: schema.products.id,
      categorySlug: schema.categories.slug,
    })
    .from(schema.products)
    .innerJoin(schema.shops, eq(schema.products.shopId, schema.shops.id))
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(and(...publicConditions()))
    .orderBy(desc(schema.products.createdAt));

  const images = await primaryImagePaths(
    db,
    rows.map((r) => r.productId),
  );
  const covers = new Map<string, string>();
  for (const row of rows) {
    const img = images.get(row.productId);
    if (img && !covers.has(row.categorySlug)) covers.set(row.categorySlug, img);
  }
  return covers;
}
