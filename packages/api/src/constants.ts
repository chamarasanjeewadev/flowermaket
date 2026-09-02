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
