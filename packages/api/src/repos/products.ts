/**
 * Product repo — owner-scoped data access for the Supplier Portal.
 *
 * Keeps `repos/catalog.ts` as the public, read-only surface (buyer marketplace)
 * and puts all supplier write paths here. Follows the same conventions as
 * `repos/shops.ts`:
 * - `db` first arg so callers compose transactions.
 * - Every mutation/read takes `shopId` and filters by it — the app-layer guard
 *   that replaces RLS (the pooler connection runs as the table owner, which
 *   bypasses RLS; see migrations/0001_rls_policies.sql).
 * - Returns `ActionResult<T>` — no throws from business logic.
 * - Pure validators are exported separately so they are unit-testable without a
 *   database (see products.test.ts).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";

/** A live client or an open transaction — both expose the query builder. */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
import { err, ok, isPgError, type ActionResult } from "../errors";
import { slugify } from "../slug";
import type { ListingType } from "./catalog";
import type { ValidationError } from "./shops";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductStatus = "draft" | "active" | "paused" | "archived";

export interface CreateProductInput {
  categoryId: string;
  nameEn: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  /** Price in LKR minor units (cents). */
  price: number;
  compareAtPrice?: number | null;
  /** null = made-to-order */
  stockQty?: number | null;
  leadTimeDays?: number | null;
  listingType?: ListingType;
  minOrderQty?: number | null;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  categoryId?: string;
  nameEn?: string;
  nameSi?: string | null;
  descriptionEn?: string | null;
  descriptionSi?: string | null;
  price?: number;
  compareAtPrice?: number | null;
  stockQty?: number | null;
  leadTimeDays?: number | null;
  listingType?: ListingType;
  minOrderQty?: number | null;
  status?: ProductStatus;
}

export interface AddProductImageInput {
  storagePath: string;
  altText?: string | null;
  isPrimary?: boolean;
}

export interface OwnerProductImage {
  id: string;
  storagePath: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface OwnerProductListItem {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
  price: number;
  compareAtPrice: number | null;
  stockQty: number | null;
  listingType: ListingType;
  minOrderQty: number | null;
  status: ProductStatus;
  categoryId: string;
  categorySlug: string;
  categoryNameEn: string;
  primaryImagePath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnerProductDetail {
  id: string;
  shopId: string;
  slug: string;
  categoryId: string;
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
  status: ProductStatus;
  images: OwnerProductImage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryOption {
  id: string;
  slug: string;
  nameEn: string;
  nameSi: string | null;
}

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const LISTING_TYPES = new Set<ListingType>(["retail", "wholesale"]);
const PRODUCT_STATUSES = new Set<ProductStatus>([
  "draft",
  "active",
  "paused",
  "archived",
]);

/** Shared field-level checks used by both create and update validators. */
function pushFieldErrors(
  input: {
    nameEn?: string;
    price?: number;
    compareAtPrice?: number | null;
    stockQty?: number | null;
    leadTimeDays?: number | null;
    listingType?: ListingType;
    minOrderQty?: number | null;
    status?: ProductStatus;
  },
  errors: ValidationError[],
): void {
  if (input.nameEn !== undefined) {
    const nameEn = input.nameEn.trim();
    if (!nameEn) {
      errors.push({ field: "nameEn", message: "Product name (English) is required." });
    } else if (nameEn.length < 2) {
      errors.push({ field: "nameEn", message: "Product name must be at least 2 characters." });
    } else if (nameEn.length > 100) {
      errors.push({ field: "nameEn", message: "Product name must be at most 100 characters." });
    }
  }

  if (input.price !== undefined) {
    if (!Number.isInteger(input.price) || input.price <= 0) {
      errors.push({ field: "price", message: "Price must be a positive whole number (LKR cents)." });
    }
  }

  if (input.compareAtPrice != null) {
    if (!Number.isInteger(input.compareAtPrice) || input.compareAtPrice <= 0) {
      errors.push({ field: "compareAtPrice", message: "Compare-at price must be a positive whole number." });
    } else if (input.price !== undefined && input.compareAtPrice <= input.price) {
      errors.push({ field: "compareAtPrice", message: "Compare-at price must be greater than the price." });
    }
  }

  if (input.stockQty != null) {
    if (!Number.isInteger(input.stockQty) || input.stockQty < 0) {
      errors.push({ field: "stockQty", message: "Stock quantity must be zero or a positive whole number." });
    }
  }

  if (input.leadTimeDays != null) {
    if (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0) {
      errors.push({ field: "leadTimeDays", message: "Lead time must be zero or a positive whole number of days." });
    }
  }

  if (input.minOrderQty != null) {
    if (!Number.isInteger(input.minOrderQty) || input.minOrderQty < 1) {
      errors.push({ field: "minOrderQty", message: "Minimum order quantity must be at least 1." });
    }
  }

  if (input.listingType !== undefined && !LISTING_TYPES.has(input.listingType)) {
    errors.push({ field: "listingType", message: "Listing type must be either retail or wholesale." });
  }

  if (input.status !== undefined && !PRODUCT_STATUSES.has(input.status)) {
    errors.push({ field: "status", message: "Status must be draft, active, paused, or archived." });
  }
}

/**
 * Validates CreateProductInput without touching the database.
 * Returns an array of validation errors (empty = valid).
 */
export function validateCreateProductInput(
  input: CreateProductInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.categoryId) {
    errors.push({ field: "categoryId", message: "Please choose a category." });
  }

  // nameEn and price are required on create — flag when missing.
  if (input.nameEn === undefined || input.nameEn.trim() === "") {
    errors.push({ field: "nameEn", message: "Product name (English) is required." });
  }
  if (input.price === undefined) {
    errors.push({ field: "price", message: "Price is required." });
  }

  pushFieldErrors(input, errors);
  return errors;
}

/**
 * Validates UpdateProductInput without touching the database.
 * Returns an array of validation errors (empty = valid).
 */
export function validateUpdateProductInput(
  input: UpdateProductInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.categoryId !== undefined && !input.categoryId) {
    errors.push({ field: "categoryId", message: "Please choose a category." });
  }

  pushFieldErrors(input, errors);
  return errors;
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

/** True when `productId` exists and belongs to `shopId`. */
async function ownsProduct(
  db: DbOrTx,
  shopId: string,
  productId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, productId),
        eq(schema.products.shopId, shopId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCategories(db: Db): Promise<CategoryOption[]> {
  return db
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      nameEn: schema.categories.nameEn,
      nameSi: schema.categories.nameSi,
    })
    .from(schema.categories)
    .where(eq(schema.categories.isActive, true))
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.nameEn));
}

/** All of a shop's products (every status), newest first. */
export async function listShopProducts(
  db: Db,
  shopId: string,
): Promise<OwnerProductListItem[]> {
  const rows = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      nameEn: schema.products.nameEn,
      nameSi: schema.products.nameSi,
      price: schema.products.price,
      compareAtPrice: schema.products.compareAtPrice,
      stockQty: schema.products.stockQty,
      listingType: schema.products.listingType,
      minOrderQty: schema.products.minOrderQty,
      status: schema.products.status,
      categoryId: schema.products.categoryId,
      categorySlug: schema.categories.slug,
      categoryNameEn: schema.categories.nameEn,
      createdAt: schema.products.createdAt,
      updatedAt: schema.products.updatedAt,
    })
    .from(schema.products)
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(eq(schema.products.shopId, shopId))
    .orderBy(desc(schema.products.createdAt));

  const images = await primaryImagePaths(
    db,
    rows.map((r) => r.id),
  );

  return rows.map((r) => ({
    ...r,
    primaryImagePath: images.get(r.id) ?? null,
  }));
}

/** A single owner-scoped product with its images, or null if not owned. */
export async function getShopProduct(
  db: Db,
  shopId: string,
  productId: string,
): Promise<OwnerProductDetail | null> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, productId),
        eq(schema.products.shopId, shopId),
      ),
    )
    .limit(1);

  if (!product) return null;

  const images = await listProductImages(db, shopId, productId);

  return {
    id: product.id,
    shopId: product.shopId,
    slug: product.slug,
    categoryId: product.categoryId,
    nameEn: product.nameEn,
    nameSi: product.nameSi,
    descriptionEn: product.descriptionEn,
    descriptionSi: product.descriptionSi,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    stockQty: product.stockQty,
    leadTimeDays: product.leadTimeDays,
    listingType: product.listingType,
    minOrderQty: product.minOrderQty,
    status: product.status,
    images,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function listProductImages(
  db: Db,
  shopId: string,
  productId: string,
): Promise<OwnerProductImage[]> {
  if (!(await ownsProduct(db, shopId, productId))) return [];
  return db
    .select({
      id: schema.productImages.id,
      storagePath: schema.productImages.storagePath,
      altText: schema.productImages.altText,
      sortOrder: schema.productImages.sortOrder,
      isPrimary: schema.productImages.isPrimary,
    })
    .from(schema.productImages)
    .where(eq(schema.productImages.productId, productId))
    .orderBy(
      desc(schema.productImages.isPrimary),
      asc(schema.productImages.sortOrder),
    );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a product for a shop.
 * - Validates input.
 * - Generates a unique slug from nameEn using a random suffix.
 * - Inserts with status default 'draft' (never public until published + verified).
 */
export async function createProduct(
  db: Db,
  shopId: string,
  input: CreateProductInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const errors = validateCreateProductInput(input);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  const nameEn = input.nameEn.trim();
  const base = slugify(nameEn) || "product";
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${base}-${suffix}`;

  try {
    const [row] = await db
      .insert(schema.products)
      .values({
        shopId,
        categoryId: input.categoryId,
        slug,
        nameEn,
        nameSi: input.nameSi ?? null,
        descriptionEn: input.descriptionEn ?? null,
        descriptionSi: input.descriptionSi ?? null,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        stockQty: input.stockQty ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        listingType: input.listingType ?? "retail",
        minOrderQty: input.minOrderQty ?? null,
        status: input.status ?? "draft",
      })
      .returning({ id: schema.products.id, slug: schema.products.slug });

    return ok({ id: row.id, slug: row.slug });
  } catch (e) {
    if (isPgError(e, "23503")) {
      return err("validation", "That category does not exist.");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not create product.",
    );
  }
}

/**
 * Update a shop's product (owner-scoped). Slug and shopId may NOT be changed.
 * Only fields present in `patch` are updated.
 */
export async function updateProduct(
  db: Db,
  shopId: string,
  productId: string,
  patch: UpdateProductInput,
): Promise<ActionResult<{ id: string }>> {
  const errors = validateUpdateProductInput(patch);
  if (errors.length > 0) {
    return err("validation", errors.map((e) => e.message).join(" "));
  }

  type ProductUpdate = {
    updatedAt: Date;
    categoryId?: string;
    nameEn?: string;
    nameSi?: string | null;
    descriptionEn?: string | null;
    descriptionSi?: string | null;
    price?: number;
    compareAtPrice?: number | null;
    stockQty?: number | null;
    leadTimeDays?: number | null;
    listingType?: ListingType;
    minOrderQty?: number | null;
    status?: ProductStatus;
  };

  const set: ProductUpdate = { updatedAt: new Date() };
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.nameEn !== undefined) set.nameEn = patch.nameEn.trim();
  if ("nameSi" in patch) set.nameSi = patch.nameSi ?? null;
  if ("descriptionEn" in patch) set.descriptionEn = patch.descriptionEn ?? null;
  if ("descriptionSi" in patch) set.descriptionSi = patch.descriptionSi ?? null;
  if (patch.price !== undefined) set.price = patch.price;
  if ("compareAtPrice" in patch) set.compareAtPrice = patch.compareAtPrice ?? null;
  if ("stockQty" in patch) set.stockQty = patch.stockQty ?? null;
  if ("leadTimeDays" in patch) set.leadTimeDays = patch.leadTimeDays ?? null;
  if (patch.listingType !== undefined) set.listingType = patch.listingType;
  if ("minOrderQty" in patch) set.minOrderQty = patch.minOrderQty ?? null;
  if (patch.status !== undefined) set.status = patch.status;

  try {
    if (!(await ownsProduct(db, shopId, productId))) {
      return err("not_found", "Product not found.");
    }

    await db
      .update(schema.products)
      .set(set)
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.shopId, shopId),
        ),
      );

    return ok({ id: productId });
  } catch (e) {
    if (isPgError(e, "23503")) {
      return err("validation", "That category does not exist.");
    }
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not update product.",
    );
  }
}

/**
 * Attach an image to a product (owner-scoped).
 * - Appends at the end of the sort order.
 * - The first image on a product becomes primary automatically; passing
 *   `isPrimary: true` promotes this image and demotes the others.
 */
export async function addProductImage(
  db: Db,
  shopId: string,
  productId: string,
  input: AddProductImageInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await db.transaction(async (tx) => {
      if (!(await ownsProduct(tx, shopId, productId))) {
        return err("not_found", "Product not found.");
      }

      const existing = await tx
        .select({
          id: schema.productImages.id,
          sortOrder: schema.productImages.sortOrder,
        })
        .from(schema.productImages)
        .where(eq(schema.productImages.productId, productId));

      const isFirst = existing.length === 0;
      const makePrimary = input.isPrimary === true || isFirst;
      const nextSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

      if (makePrimary && !isFirst) {
        await tx
          .update(schema.productImages)
          .set({ isPrimary: false })
          .where(eq(schema.productImages.productId, productId));
      }

      const [row] = await tx
        .insert(schema.productImages)
        .values({
          productId,
          storagePath: input.storagePath,
          altText: input.altText ?? null,
          sortOrder: nextSort,
          isPrimary: makePrimary,
        })
        .returning({ id: schema.productImages.id });

      return ok({ id: row.id });
    });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not add image.",
    );
  }
}

/**
 * Delete a product image (owner-scoped). Returns the deleted storage path so
 * the caller can remove the object from Storage.
 */
export async function deleteProductImage(
  db: Db,
  shopId: string,
  imageId: string,
): Promise<ActionResult<{ id: string; storagePath: string; productId: string }>> {
  try {
    return await db.transaction(async (tx) => {
      const [img] = await tx
        .select({
          id: schema.productImages.id,
          productId: schema.productImages.productId,
          storagePath: schema.productImages.storagePath,
          isPrimary: schema.productImages.isPrimary,
        })
        .from(schema.productImages)
        .innerJoin(
          schema.products,
          eq(schema.products.id, schema.productImages.productId),
        )
        .where(
          and(
            eq(schema.productImages.id, imageId),
            eq(schema.products.shopId, shopId),
          ),
        )
        .limit(1);

      if (!img) return err("not_found", "Image not found.");

      await tx
        .delete(schema.productImages)
        .where(eq(schema.productImages.id, imageId));

      // If we removed the primary image, promote the next one (lowest sortOrder).
      if (img.isPrimary) {
        const [next] = await tx
          .select({ id: schema.productImages.id })
          .from(schema.productImages)
          .where(eq(schema.productImages.productId, img.productId))
          .orderBy(asc(schema.productImages.sortOrder))
          .limit(1);
        if (next) {
          await tx
            .update(schema.productImages)
            .set({ isPrimary: true })
            .where(eq(schema.productImages.id, next.id));
        }
      }

      return ok({
        id: img.id,
        storagePath: img.storagePath,
        productId: img.productId,
      });
    });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not delete image.",
    );
  }
}

/** Make one image the primary for its product (owner-scoped). */
export async function setPrimaryImage(
  db: Db,
  shopId: string,
  imageId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    return await db.transaction(async (tx) => {
      const [img] = await tx
        .select({
          id: schema.productImages.id,
          productId: schema.productImages.productId,
        })
        .from(schema.productImages)
        .innerJoin(
          schema.products,
          eq(schema.products.id, schema.productImages.productId),
        )
        .where(
          and(
            eq(schema.productImages.id, imageId),
            eq(schema.products.shopId, shopId),
          ),
        )
        .limit(1);

      if (!img) return err("not_found", "Image not found.");

      await tx
        .update(schema.productImages)
        .set({ isPrimary: false })
        .where(eq(schema.productImages.productId, img.productId));

      await tx
        .update(schema.productImages)
        .set({ isPrimary: true })
        .where(eq(schema.productImages.id, imageId));

      return ok({ id: imageId });
    });
  } catch (e) {
    return err(
      "unknown",
      e instanceof Error ? e.message : "Could not set primary image.",
    );
  }
}
