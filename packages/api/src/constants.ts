/** Shared marketplace constants: districts, commission. */

export interface District {
  slug: string;
  nameEn: string;
  nameSi: string;
}

/** All 25 administrative districts of Sri Lanka, in province order. */
export const DISTRICTS: readonly District[] = [
  { slug: "colombo", nameEn: "Colombo", nameSi: "කොළඹ" },
  { slug: "gampaha", nameEn: "Gampaha", nameSi: "ගම්පහ" },
  { slug: "kalutara", nameEn: "Kalutara", nameSi: "කළුතර" },
  { slug: "kandy", nameEn: "Kandy", nameSi: "මහනුවර" },
  { slug: "matale", nameEn: "Matale", nameSi: "මාතලේ" },
  { slug: "nuwara-eliya", nameEn: "Nuwara Eliya", nameSi: "නුවරඑළිය" },
  { slug: "galle", nameEn: "Galle", nameSi: "ගාල්ල" },
  { slug: "matara", nameEn: "Matara", nameSi: "මාතර" },
  { slug: "hambantota", nameEn: "Hambantota", nameSi: "හම්බන්තොට" },
  { slug: "jaffna", nameEn: "Jaffna", nameSi: "යාපනය" },
  { slug: "kilinochchi", nameEn: "Kilinochchi", nameSi: "කිලිනොච්චිය" },
  { slug: "mannar", nameEn: "Mannar", nameSi: "මන්නාරම" },
  { slug: "vavuniya", nameEn: "Vavuniya", nameSi: "වවුනියාව" },
  { slug: "mullaitivu", nameEn: "Mullaitivu", nameSi: "මුලතිව්" },
  { slug: "batticaloa", nameEn: "Batticaloa", nameSi: "මඩකලපුව" },
  { slug: "ampara", nameEn: "Ampara", nameSi: "අම්පාර" },
  { slug: "trincomalee", nameEn: "Trincomalee", nameSi: "ත්‍රිකුණාමලය" },
  { slug: "kurunegala", nameEn: "Kurunegala", nameSi: "කුරුණෑගල" },
  { slug: "puttalam", nameEn: "Puttalam", nameSi: "පුත්තලම" },
  { slug: "anuradhapura", nameEn: "Anuradhapura", nameSi: "අනුරාධපුරය" },
  { slug: "polonnaruwa", nameEn: "Polonnaruwa", nameSi: "පොළොන්නරුව" },
  { slug: "badulla", nameEn: "Badulla", nameSi: "බදුල්ල" },
  { slug: "moneragala", nameEn: "Moneragala", nameSi: "මොනරාගල" },
  { slug: "ratnapura", nameEn: "Ratnapura", nameSi: "රත්නපුර" },
  { slug: "kegalle", nameEn: "Kegalle", nameSi: "කෑගල්ල" },
] as const;

/** Platform commission in basis points (1000 = 10%). */
export const DEFAULT_COMMISSION_BPS = 1000;

/** Default marketplace markup on sourcing cost, in basis points (2500 = 25%). */
export const DEFAULT_MARGIN_BPS = 2500;

/** Allowed order/quote units. */
export const ORDER_UNITS = ["stem", "bunch", "box"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];

/** How an order reached the marketplace (mirrors the order_source pg enum). */
export const ORDER_SOURCES = ["whatsapp", "phone", "web", "walk_in"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** Human-readable labels for order sources (admin UI). */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  whatsapp: "WhatsApp",
  phone: "Phone call",
  web: "Website",
  walk_in: "Walk-in",
};

/**
 * Category slugs whose products are offered as "ingredients" in the AI bouquet
 * designer. Editable in one place — add a slug here to expose that category's
 * stems in the picker. Must match seeded category slugs.
 */
export const DESIGNER_CATEGORY_SLUGS: readonly string[] = [
  "roses",
  "gerberas",
  "orchids",
  "chrysanthemums",
  "loose-flowers",
];

/** Seller types a shop can hold (any non-empty combination), in canonical
 * display order: florist (arranges / retail), supplier (bulk wholesaler /
 * trader), farmer (grows flowers). Mirrors the `seller_type` pg enum. */
export const SELLER_TYPES = ["florist", "supplier", "farmer"] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

/** Types that receive sourcing RFQs (they sell stems, not arrangements). */
export const SOURCING_SELLER_TYPES: readonly SellerType[] = ["supplier", "farmer"];

export function isSellerType(value: unknown): value is SellerType {
  return (
    typeof value === "string" &&
    (SELLER_TYPES as readonly string[]).includes(value)
  );
}

/** Dedupe + canonical order; null when empty or any value is unknown. */
export function normalizeSellerTypes(
  input: readonly unknown[] | null | undefined,
): SellerType[] | null {
  if (!input || input.length === 0) return null;
  if (!input.every(isSellerType)) return null;
  return SELLER_TYPES.filter((t) => input.includes(t));
}
