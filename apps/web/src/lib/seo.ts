/**
 * Structured-data (JSON-LD) builders and small SEO helpers.
 *
 * These run inside route `head()` functions (server + client). Keep them pure
 * and dependency-light. All URLs are absolutised via `absoluteUrl` so the
 * markup is valid regardless of the locale prefix in the current path.
 */
import { absoluteUrl, siteUrl, CONTACT_EMAIL, CONTACT_PHONE } from "./site";
import type { Locale } from "../i18n";

export const SITE_NAME = "FlowerMarket.lk";
export const DEFAULT_OG_IMAGE = "/og-image.png";

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

/** A single JSON-LD `<script>` head entry. */
export function jsonLdScript(data: unknown): {
  type: "application/ld+json";
  children: string;
} {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

/** Shared Open Graph + Twitter card tags for public pages. */
export function socialMeta(input: {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: "website" | "article" | "product";
  locale?: Locale;
}): MetaEntry[] {
  const imageInput = input.image ?? DEFAULT_OG_IMAGE;
  const image = /^https?:\/\//.test(imageInput)
    ? imageInput
    : absoluteUrl(imageInput);
  return [
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:site_name", content: SITE_NAME },
    ...(input.locale
      ? [{ property: "og:locale", content: input.locale }]
      : []),
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: input.url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
    { name: "twitter:image", content: image },
  ];
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
      "A Sri Lankan marketplace for browsing retail and wholesale flower listings by category, district and seller.",
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE,
    areaServed: { "@type": "Country", name: "Sri Lanka" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      telephone: CONTACT_PHONE,
      areaServed: "LK",
      availableLanguage: ["en", "si"],
    },
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
