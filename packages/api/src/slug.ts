/**
 * URL slug helpers. Pure functions — no I/O — so they are trivially testable
 * and safe to run on Workers, Node, and the browser alike.
 */

/** Lowercase, ASCII-fold and hyphenate arbitrary text into a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    // strip combining diacritics (U+0300–U+036F) left over from NFKD folding
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 6 chars of base36 randomness from the Web Crypto API. */
function randomSuffix(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}

/**
 * SEO job slug: `senior-accountant-colombo-a1b2c3`.
 * The random suffix keeps slugs unique without a DB round-trip.
 */
export function generateJobSlug(
  title: string,
  city: string | null | undefined,
): string {
  const base = slugify([title, city ?? ""].filter(Boolean).join(" "));
  return `${base || "job"}-${randomSuffix(6)}`;
}
