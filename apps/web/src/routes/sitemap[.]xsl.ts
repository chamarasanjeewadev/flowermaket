import { createFileRoute } from "@tanstack/react-router";

const XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <title>Sitemap — FlowerMarket.lk</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui,-apple-system,sans-serif;background:#fafaf8;color:#1a1a1a;padding:2rem 1rem}
          .wrap{max-width:960px;margin:0 auto}
          h1{font-size:1.5rem;font-weight:700;margin-bottom:.25rem}
          .sub{color:#666;font-size:.875rem;margin-bottom:1.5rem}
          table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
          th{background:#f5f4f0;text-align:left;padding:.6rem 1rem;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1px solid #e5e5e5}
          td{padding:.5rem 1rem;font-size:.8125rem;border-bottom:1px solid #f0f0f0;vertical-align:middle}
          tr:last-child td{border-bottom:none}
          tr:hover td{background:#fafaf8}
          a{color:#c75b39;text-decoration:none}
          a:hover{text-decoration:underline}
          .badge{display:inline-block;padding:.15rem .4rem;border-radius:4px;font-size:.7rem;font-weight:600;background:#f0ede8;color:#666}
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>FlowerMarket.lk Sitemap</h1>
          <p class="sub"><xsl:value-of select="count(sm:urlset/sm:url)"/> URLs indexed</p>
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Change frequency</th>
                <th>Priority</th>
                <th>Last modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sm:urlset/sm:url">
                <tr>
                  <td><a href="{sm:loc}"><xsl:value-of select="sm:loc"/></a></td>
                  <td><xsl:if test="sm:changefreq"><span class="badge"><xsl:value-of select="sm:changefreq"/></span></xsl:if></td>
                  <td><xsl:value-of select="sm:priority"/></td>
                  <td><xsl:value-of select="sm:lastmod"/></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

export const Route = createFileRoute("/sitemap.xsl")({
  server: {
    handlers: {
      GET: async () =>
        new Response(XSL, {
          headers: {
            "Content-Type": "text/xsl; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        }),
    },
  },
});
