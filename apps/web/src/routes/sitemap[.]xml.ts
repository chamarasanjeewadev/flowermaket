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
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
    u.priority ? `    <priority>${u.priority}</priority>` : null,
    "  </url>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const base = siteUrl();

        const urls: SitemapUrl[] = [];
        for (const loc of LOCALES) {
          urls.push({
            loc: `${base}/${loc}/`,
            changefreq: "daily",
            priority: "1.0",
          });
          urls.push({
            loc: `${base}/${loc}/products`,
            changefreq: "daily",
            priority: "0.9",
          });
          urls.push({
            loc: `${base}/${loc}/blog`,
            changefreq: "weekly",
            priority: "0.6",
          });
          for (const post of listPosts()) {
            urls.push({
              loc: `${base}/${loc}/blog/${post.slug}`,
              changefreq: "monthly",
              priority: "0.7",
              lastmod: post.dateModified ?? post.datePublished,
            });
          }
        }

        const db = tryCreateDb();
        if (db) {
          try {
            const data = await listCatalogSitemap(db);
            for (const loc of LOCALES) {
              for (const c of data.categories) {
                urls.push({
                  loc: `${base}/${loc}/c/${c.slug}`,
                  changefreq: "weekly",
                  priority: "0.7",
                });
              }
              for (const s of data.shops) {
                urls.push({
                  loc: `${base}/${loc}/shops/${s.slug}`,
                  changefreq: "weekly",
                  priority: "0.6",
                });
              }
              for (const p of data.products) {
                urls.push({
                  loc: `${base}/${loc}/products/${p.slug}`,
                  changefreq: "weekly",
                  priority: "0.8",
                  lastmod: p.updatedAt.toISOString(),
                });
              }
            }
          } catch {
            // Degrade to the static entries if the catalog query fails.
          }
        }

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
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
