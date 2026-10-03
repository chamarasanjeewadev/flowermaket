import { createFileRoute } from "@tanstack/react-router";
import { listCatalogSitemap, tryCreateDb } from "@flowers/api";
import { LOCALES } from "../i18n";
import { siteUrl } from "../lib/site";
import { listPosts } from "../content/posts";

/**
 * Server-only route — enumerates home, browse, category, shop and product URLs
 * across both locales. DB access is server-only (safe to import @flowers/api).
 */

interface SitemapUrl {
  loc: string;
  changefreq?: string;
  priority?: string;
  lastmod?: string;
  alternates?: Array<{ href: string; hreflang: string }>;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderUrl(u: SitemapUrl): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(u.loc)}</loc>`,
    ...(u.alternates ?? []).map(
      (alt) =>
        `    <xhtml:link rel="alternate" hreflang="${xmlEscape(
          alt.hreflang,
        )}" href="${xmlEscape(alt.href)}" />`,
    ),
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
    u.priority ? `    <priority>${u.priority}</priority>` : null,
    "  </url>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function localizedSitemapUrls(
  base: string,
  path: string,
  options: Omit<SitemapUrl, "loc" | "alternates"> = {},
): SitemapUrl[] {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const alternates = [
    ...LOCALES.map((loc) => ({
      hreflang: loc,
      href: `${base}/${loc}${suffix}`,
    })),
    { hreflang: "x-default", href: `${base}/en${suffix}` },
  ];
  return LOCALES.map((loc) => ({
    ...options,
    loc: `${base}/${loc}${suffix}`,
    alternates,
  }));
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const base = siteUrl();

        const urls: SitemapUrl[] = [];
        urls.push(
          ...localizedSitemapUrls(base, "/", {
            changefreq: "daily",
            priority: "1.0",
          }),
          ...localizedSitemapUrls(base, "/products", {
            changefreq: "daily",
            priority: "0.9",
          }),
          ...localizedSitemapUrls(base, "/design", {
            changefreq: "monthly",
            priority: "0.75",
          }),
          ...localizedSitemapUrls(base, "/designs", {
            changefreq: "daily",
            priority: "0.6",
          }),
          ...localizedSitemapUrls(base, "/shops", {
            changefreq: "weekly",
            priority: "0.7",
          }),
          ...localizedSitemapUrls(base, "/fresh-flowers-near-me", {
            changefreq: "daily",
            priority: "0.85",
          }),
          ...localizedSitemapUrls(base, "/fresh-flower-quotation-generator", {
            changefreq: "monthly",
            priority: "0.8",
          }),
          ...localizedSitemapUrls(base, "/blog", {
            changefreq: "weekly",
            priority: "0.6",
          }),
        );
        for (const post of listPosts()) {
          urls.push(
            ...localizedSitemapUrls(base, `/blog/${post.slug}`, {
              changefreq: "monthly",
              priority: "0.7",
              lastmod: post.dateModified ?? post.datePublished,
            }),
          );
        }

        const db = tryCreateDb();
        if (db) {
          try {
            const data = await listCatalogSitemap(db);
            for (const c of data.categories) {
              urls.push(
                ...localizedSitemapUrls(base, `/c/${c.slug}`, {
                  changefreq: "weekly",
                  priority: "0.7",
                }),
              );
            }
            for (const s of data.shops) {
              urls.push(
                ...localizedSitemapUrls(base, `/shops/${s.slug}`, {
                  changefreq: "weekly",
                  priority: "0.6",
                }),
              );
            }
            for (const p of data.products) {
              urls.push(
                ...localizedSitemapUrls(base, `/products/${p.slug}`, {
                  changefreq: "weekly",
                  priority: "0.8",
                  lastmod: p.updatedAt.toISOString(),
                }),
              );
            }
          } catch {
            // Degrade to the static entries if the catalog query fails.
          }
        }

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          ...urls.map(renderUrl),
          "</urlset>",
          "",
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
