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
 *
 * `locale` is the active locale for this page — canonical points to the
 * current locale's own URL, not always /en.
 */
export function hreflangLinks(
  path: string,
  locale: Locale,
): Array<{
  rel: string;
  href: string;
  hreflang?: string;
}> {
  const base = siteUrl();
  // Normalise: strip leading slash so we can re-add it cleanly
  const stripped = path.replace(/^\//, "");
  const suffix = stripped ? `/${stripped}` : "";

  const links: Array<{ rel: string; href: string; hreflang?: string }> = [];

  // Canonical points to the CURRENT locale's own URL
  links.push({ rel: "canonical", href: `${base}/${locale}${suffix}` });

  // Per-locale alternates
  for (const loc of LOCALES as readonly Locale[]) {
    links.push({
      rel: "alternate",
      href: `${base}/${loc}${suffix}`,
      hreflang: loc,
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
