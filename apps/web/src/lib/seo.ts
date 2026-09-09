/**
 * Structured-data (JSON-LD) builders and small SEO helpers.
 *
 * These run inside route `head()` functions (server + client). Keep them pure
 * and dependency-light. All URLs are absolutised via `absoluteUrl` so the
 * markup is valid regardless of the locale prefix in the current path.
 */
import { absoluteUrl, siteUrl } from "./site";
import type { Locale } from "../i18n";

export const SITE_NAME = "FlowerMarket.lk";

/** A single JSON-LD `<script>` head entry. */
export function jsonLdScript(data: unknown): {
  type: "application/ld+json";
  children: string;
} {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

/**
 * Organization node — establishes the brand entity for the Knowledge Graph.
 * Emitted once on the home page.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE_NAME,
    url: siteUrl(),
    logo: absoluteUrl("/logo.png"),
    image: absoluteUrl("/og-image.png"),
    description:
      "Sri Lanka's online flower marketplace connecting buyers with local growers and florists — retail bouquets and wholesale stems, grower-direct.",
    areaServed: { "@type": "Country", name: "Sri Lanka" },
  };
}

/**
 * WebSite node with a SearchAction so Google can render a sitelinks searchbox
 * pointing at the browse page's `?q=` filter.
 */
export function webSiteJsonLd() {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: SITE_NAME,
    url: base,
    inLanguage: ["en", "si"],
    publisher: { "@id": `${base}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/en/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * BreadcrumbList from a trail of `{ name, path }` crumbs. `path` is the full
 * locale-prefixed path (e.g. `/en/c/roses`); it is absolutised here.
 */
export function breadcrumbJsonLd(
  crumbs: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** Convenience: locale-prefixed path helper for breadcrumb trails. */
export function localePath(locale: Locale, path: string): string {
  const suffix = path.replace(/^\//, "");
  return suffix ? `/${locale}/${suffix}` : `/${locale}`;
}
