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
  category: "imported" | "tropical" | "local";
  defaultUnit: "stem" | "bunch" | "arrangement" | "item";
};

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
