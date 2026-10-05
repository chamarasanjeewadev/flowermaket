import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import { DESIGNER_CATEGORY_SLUGS } from "../constants";
import type { Db } from "../db";
import type { FlowerCategoryRow, FlowerVariantRow } from "../flowers-client";
export type { FlowerCategoryRow, FlowerVariantRow };
export { variantDisplayName } from "../flowers-client";

export type FlowerSpeciesWithVariants = {
  id: string;
  nameEn: string;
  nameSi: string;
  localName: string | null;
  category: string;
  defaultUnit: "stem" | "bunch" | "arrangement" | "item";
  sortOrder: number;
  isActive: boolean;
  variants: Array<{
    id: string;
    colorEn: string | null;
    colorSi: string | null;
    imagePath: string | null;
    imageUrl: string | null;
    isFeatured: boolean;
    isActive: boolean;
    sortOrder: number;
  }>;
};

export type UpsertSpeciesInput = {
  id: string;
  nameEn: string;
  nameSi: string;
  localName?: string | null;
  category: string;
  defaultUnit: "stem" | "bunch" | "arrangement" | "item";
  sortOrder?: number;
  isActive?: boolean;
};

export type UpsertVariantInput = {
  id: string;
  speciesId: string;
  colorEn?: string | null;
  colorSi?: string | null;
  imagePath?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flowerImageUrl(
  imagePath: string | null,
  supabaseUrl: string,
): string | null {
  if (!imagePath || !supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/flower-images/${imagePath}`;
}

// ---------------------------------------------------------------------------
// Shared select shape
// ---------------------------------------------------------------------------

const variantSelect = {
  id: schema.flowerVariants.id,
  speciesId: schema.flowerVariants.speciesId,
  colorEn: schema.flowerVariants.colorEn,
  colorSi: schema.flowerVariants.colorSi,
  imagePath: schema.flowerVariants.imagePath,
  isFeatured: schema.flowerVariants.isFeatured,
  isActive: schema.flowerVariants.isActive,
  sortOrder: schema.flowerVariants.sortOrder,
  nameEn: schema.flowerSpecies.nameEn,
  nameSi: schema.flowerSpecies.nameSi,
  localName: schema.flowerSpecies.localName,
  category: schema.flowerSpecies.category,
  categoryNameEn: schema.flowerCategories.nameEn,
  categoryNameSi: schema.flowerCategories.nameSi,
  defaultUnit: schema.flowerSpecies.defaultUnit,
} as const;

const categoryJoin = eq(schema.flowerSpecies.category, schema.flowerCategories.slug);

type RawVariantRow = Omit<FlowerVariantRow, "imageUrl">;

function attachImageUrl(
  rows: RawVariantRow[],
  supabaseUrl: string,
): FlowerVariantRow[] {
  return rows.map((r) => ({
    ...r,
    imageUrl: flowerImageUrl(r.imagePath, supabaseUrl),
  }));
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export async function listFlowerVariants(
  db: Db,
  supabaseUrl: string,
): Promise<FlowerVariantRow[]> {
  const rows = await db
    .select(variantSelect)
    .from(schema.flowerVariants)
    .innerJoin(
      schema.flowerSpecies,
      eq(schema.flowerVariants.speciesId, schema.flowerSpecies.id),
    )
    .leftJoin(schema.flowerCategories, categoryJoin)
    .where(
      and(
        eq(schema.flowerVariants.isActive, true),
        eq(schema.flowerSpecies.isActive, true),
      ),
    )
    .orderBy(asc(schema.flowerVariants.sortOrder));
  return attachImageUrl(rows as RawVariantRow[], supabaseUrl);
}

export async function listFeaturedVariants(
  db: Db,
  supabaseUrl: string,
): Promise<FlowerVariantRow[]> {
  const rows = await db
    .select(variantSelect)
    .from(schema.flowerVariants)
    .innerJoin(
      schema.flowerSpecies,
      eq(schema.flowerVariants.speciesId, schema.flowerSpecies.id),
    )
    .leftJoin(schema.flowerCategories, categoryJoin)
    .where(
      and(
        eq(schema.flowerVariants.isActive, true),
        eq(schema.flowerVariants.isFeatured, true),
        eq(schema.flowerSpecies.isActive, true),
      ),
    )
    .orderBy(asc(schema.flowerVariants.sortOrder));
  return attachImageUrl(rows as RawVariantRow[], supabaseUrl);
}

export async function listDesignerVariants(
  db: Db,
  supabaseUrl: string,
): Promise<FlowerVariantRow[]> {
  const linked = await db
    .selectDistinct({ variantId: schema.products.flowerVariantId })
    .from(schema.products)
    .innerJoin(
      schema.categories,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .where(
      and(
        eq(schema.products.status, "active"),
        eq(schema.products.moderationStatus, "approved"),
        inArray(schema.categories.slug, [...DESIGNER_CATEGORY_SLUGS]),
        isNotNull(schema.products.flowerVariantId),
      ),
    );

  const variantIds = linked
    .map((r) => r.variantId)
    .filter((id): id is string => id !== null);

  // Fallback: show all active variants when no products are linked yet,
  // so the /en/design page is not an empty screen during migration period.
  const whereClause =
    variantIds.length > 0
      ? and(
          eq(schema.flowerVariants.isActive, true),
          eq(schema.flowerSpecies.isActive, true),
          inArray(schema.flowerVariants.id, variantIds),
        )
      : and(
          eq(schema.flowerVariants.isActive, true),
          eq(schema.flowerSpecies.isActive, true),
        );

  const rows = await db
    .select(variantSelect)
    .from(schema.flowerVariants)
    .innerJoin(
      schema.flowerSpecies,
      eq(schema.flowerVariants.speciesId, schema.flowerSpecies.id),
    )
    .leftJoin(schema.flowerCategories, categoryJoin)
    .where(whereClause)
    .orderBy(asc(schema.flowerVariants.sortOrder));
  return attachImageUrl(rows as RawVariantRow[], supabaseUrl);
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export async function listAdminSpeciesWithVariants(
  db: Db,
  supabaseUrl: string,
): Promise<FlowerSpeciesWithVariants[]> {
  const [species, variants] = await Promise.all([
    db
      .select()
      .from(schema.flowerSpecies)
      .orderBy(asc(schema.flowerSpecies.sortOrder)),
    db
      .select()
      .from(schema.flowerVariants)
      .orderBy(asc(schema.flowerVariants.sortOrder)),
  ]);

  const variantsBySpecies = new Map<
    string,
    (typeof variants)[number][]
  >();
  for (const v of variants) {
    if (!variantsBySpecies.has(v.speciesId)) {
      variantsBySpecies.set(v.speciesId, []);
    }
    variantsBySpecies.get(v.speciesId)!.push(v);
  }

  return species.map((s) => ({
    ...s,
    variants: (variantsBySpecies.get(s.id) ?? []).map((v) => ({
      ...v,
      imageUrl: flowerImageUrl(v.imagePath, supabaseUrl),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------

export async function upsertFlowerSpecies(
  db: Db,
  data: UpsertSpeciesInput,
): Promise<void> {
  await db
    .insert(schema.flowerSpecies)
    .values({
      id: data.id,
      nameEn: data.nameEn,
      nameSi: data.nameSi,
      localName: data.localName ?? null,
      category: data.category,
      defaultUnit: data.defaultUnit,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .onConflictDoUpdate({
      target: schema.flowerSpecies.id,
      set: {
        nameEn: data.nameEn,
        nameSi: data.nameSi,
        localName: data.localName ?? null,
        category: data.category,
        defaultUnit: data.defaultUnit,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
}

export async function upsertFlowerVariant(
  db: Db,
  data: UpsertVariantInput,
): Promise<void> {
  // Only overwrite fields the caller actually sent — e.g. toggling "featured"
  // must not wipe an already-uploaded photo.
  const set: Partial<typeof schema.flowerVariants.$inferInsert> = {
    speciesId: data.speciesId,
  };
  if (data.colorEn !== undefined) set.colorEn = data.colorEn;
  if (data.colorSi !== undefined) set.colorSi = data.colorSi;
  if (data.imagePath !== undefined) set.imagePath = data.imagePath;
  if (data.isFeatured !== undefined) set.isFeatured = data.isFeatured;
  if (data.isActive !== undefined) set.isActive = data.isActive;
  if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;

  await db
    .insert(schema.flowerVariants)
    .values({
      id: data.id,
      speciesId: data.speciesId,
      colorEn: data.colorEn ?? null,
      colorSi: data.colorSi ?? null,
      imagePath: data.imagePath ?? null,
      isFeatured: data.isFeatured ?? false,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    })
    .onConflictDoUpdate({ target: schema.flowerVariants.id, set });
}

export async function patchVariantImagePath(
  db: Db,
  variantId: string,
  imagePath: string | null,
): Promise<void> {
  await db
    .update(schema.flowerVariants)
    .set({ imagePath })
    .where(eq(schema.flowerVariants.id, variantId));
}

// ---------------------------------------------------------------------------
// Flower categories
// ---------------------------------------------------------------------------

export type FlowerCategoryWithCount = FlowerCategoryRow & { speciesCount: number };

export type UpsertFlowerCategoryInput = {
  slug: string;
  nameEn: string;
  nameSi?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

/** Every category (active + inactive) with how many species use it. */
export async function listFlowerCategories(
  db: Db,
): Promise<FlowerCategoryWithCount[]> {
  const [categories, counts] = await Promise.all([
    db
      .select()
      .from(schema.flowerCategories)
      .orderBy(asc(schema.flowerCategories.sortOrder), asc(schema.flowerCategories.nameEn)),
    db
      .select({ slug: schema.flowerSpecies.category, n: count() })
      .from(schema.flowerSpecies)
      .groupBy(schema.flowerSpecies.category),
  ]);
  const bySlug = new Map(counts.map((c) => [c.slug, c.n]));
  return categories.map((c) => ({ ...c, speciesCount: bySlug.get(c.slug) ?? 0 }));
}

export async function upsertFlowerCategory(
  db: Db,
  data: UpsertFlowerCategoryInput,
): Promise<void> {
  const set: Partial<typeof schema.flowerCategories.$inferInsert> = {
    nameEn: data.nameEn,
  };
  if (data.nameSi !== undefined) set.nameSi = data.nameSi;
  if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) set.isActive = data.isActive;
  await db
    .insert(schema.flowerCategories)
    .values({
      slug: data.slug,
      nameEn: data.nameEn,
      nameSi: data.nameSi ?? null,
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .onConflictDoUpdate({ target: schema.flowerCategories.slug, set });
}

/** Deletes a category only when no species uses it. Returns false if in use. */
export async function deleteFlowerCategory(db: Db, slug: string): Promise<boolean> {
  const [used] = await db
    .select({ n: count() })
    .from(schema.flowerSpecies)
    .where(eq(schema.flowerSpecies.category, slug));
  if ((used?.n ?? 0) > 0) return false;
  await db
    .delete(schema.flowerCategories)
    .where(eq(schema.flowerCategories.slug, slug));
  return true;
}
