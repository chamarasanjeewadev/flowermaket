/**
 * Client-safe flower helpers — no DB imports.
 * Import from "@flowers/api/flowers" in client components.
 */

export type FlowerVariantRow = {
  id: string;
  speciesId: string;
  colorEn: string | null;
  colorSi: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  nameEn: string;
  nameSi: string;
  localName: string | null;
  /** flower_categories.slug */
  category: string;
  categoryNameEn: string | null;
  categoryNameSi: string | null;
  defaultUnit: "stem" | "bunch" | "arrangement" | "item";
};

export type FlowerCategoryRow = {
  slug: string;
  nameEn: string;
  nameSi: string | null;
  sortOrder: number;
  isActive: boolean;
};

/** Units a species can be sold in by default. */
export const FLOWER_UNITS = ["stem", "bunch", "arrangement", "item"] as const;
export type FlowerUnit = (typeof FLOWER_UNITS)[number];

/** Fallback label for a category slug with no flower_categories row. */
export function humanizeCategorySlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function variantDisplayName(
  v: Pick<FlowerVariantRow, "colorEn" | "colorSi" | "nameEn" | "nameSi">,
  locale: "en" | "si",
): string {
  if (locale === "si") {
    const color = v.colorSi ?? v.colorEn;
    return color ? `${color} ${v.nameSi}` : v.nameSi;
  }
  return v.colorEn ? `${v.colorEn} ${v.nameEn}` : v.nameEn;
}
