import { createFileRoute } from "@tanstack/react-router";
import { siteUrl } from "../lib/site";

/**
 * Server-only route — lists /en/ and /si/ home URLs.
 * Structure is extensible per-entity in later phases.
 */

interface SitemapUrl {
  loc: string;
  changefreq?: string;
  priority?: string;
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
      GET: () => {
        const base = siteUrl();

        const urls: SitemapUrl[] = [
          { loc: `${base}/en/`, changefreq: "daily", priority: "1.0" },
          { loc: `${base}/si/`, changefreq: "daily", priority: "1.0" },
        ];

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
