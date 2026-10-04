import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import { DESIGNER_CATEGORY_SLUGS } from "../constants";
import type { Db } from "../db";
import type { FlowerVariantRow } from "../flowers-client";
export type { FlowerVariantRow };
export { variantDisplayName } from "../flowers-client";

export type FlowerSpeciesWithVariants = {
  id: string;
  nameEn: string;
  nameSi: string;
  localName: string | null;
  category: "imported" | "tropical" | "local";
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
  category: "imported" | "tropical" | "local";
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
  if (!imagePath) return null;
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
  defaultUnit: schema.flowerSpecies.defaultUnit,
} as const;

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
    .onConflictDoUpdate({
      target: schema.flowerVariants.id,
      set: {
        speciesId: data.speciesId,
        colorEn: data.colorEn ?? null,
        colorSi: data.colorSi ?? null,
        imagePath: data.imagePath ?? null,
        isFeatured: data.isFeatured ?? false,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
}

export async function patchVariantImagePath(
  db: Db,
  variantId: string,
  imagePath: string,
): Promise<void> {
  await db
    .update(schema.flowerVariants)
    .set({ imagePath })
    .where(eq(schema.flowerVariants.id, variantId));
}
