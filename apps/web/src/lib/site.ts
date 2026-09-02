/**
 * Canonical site origin and hreflang helpers.
 * `SITE_URL` is read lazily (Workers bind env per request) and guarded so
 * the same helper is safe in client bundles.
 */
import { LOCALES, type Locale } from "../i18n";

export const FALLBACK_SITE_URL = "https://flowers.lk";

export function siteUrl(): string {
  if (typeof process !== "undefined" && process.env?.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }
  return FALLBACK_SITE_URL;
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Returns canonical + per-locale + x-default hreflang link tags for a given
 * path (without locale prefix, e.g. "/" or "/categories/flowers").
 */
export function hreflangLinks(path: string): Array<{
  rel: string;
  href: string;
  hreflang?: string;
}> {
  const base = siteUrl();
  // Normalise: strip leading slash so we can re-add it cleanly
  const stripped = path.replace(/^\//, "");
  const suffix = stripped ? `/${stripped}` : "";

  const links: Array<{ rel: string; href: string; hreflang?: string }> = [];

  // Canonical points to English (x-default locale)
  links.push({ rel: "canonical", href: `${base}/en${suffix}` });

  // Per-locale alternates
  for (const locale of LOCALES as readonly Locale[]) {
    links.push({
      rel: "alternate",
      href: `${base}/${locale}${suffix}`,
      hreflang: locale,
    });
  }

  // x-default → English
  links.push({
    rel: "alternate",
    href: `${base}/en${suffix}`,
    hreflang: "x-default",
  });

  return links;
}
