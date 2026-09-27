# FlowerMarket.lk — SEO Strategy & Keyword Map

_Last updated: 2026-09-09. Scope: `apps/web` (the public buyer marketplace). The
supplier and admin portals are intentionally `noindex` and out of scope._

This document is the single source of truth for **which page targets which
keyword**. When you add a page or rewrite copy, update the table below so intent
stays un-cannibalised (one primary keyword → one page).

---

## 1. Where we started (audit)

The foundation was already strong:

- ✅ `robots.txt` (allows all, points to sitemap)
- ✅ Dynamic `sitemap.xml` (home, browse, categories, shops, products × both locales)
- ✅ Root metadata with Open Graph + Twitter cards and a real `og-image.png`
- ✅ `hreflang` (`en` / `si` / `x-default`) + self-referencing canonical per page
- ✅ JSON-LD: `Product` (offers), `ItemList` (category), `Florist` (shop)
- ✅ Bilingual `<title>`/description on home + browse
- ✅ `login` / `signup` already `noindex`

## 2. What we changed (this pass)

**Structured data**

- Home now emits **`Organization`** + **`WebSite`** JSON-LD. The `WebSite` node
  carries a `SearchAction` so Google can show a sitelinks searchbox pointing at
  `/en/products?q=`.
- **`BreadcrumbList`** JSON-LD added to product, category, shop and blog pages.
- `Product` JSON-LD enriched: `sku`, `brand`, `itemCondition`, offer `url`, and
  a rolling `priceValidUntil` (kills the "no price validity" Rich Results warning).
- Shop `Florist` node gained `url` + `image` and a keyword-rich fallback
  description when the shop hasn't written its own.

**On-page metadata**

- Rewrote the home, browse, category and shop `<title>`/description to lead with
  the target keyword (see the map). Category descriptions now reuse the
  hand-written `categoryIntro` copy instead of the thin `"{name} — FlowerMarket.lk"`.
- Added `og:title` / `og:description` to browse, category and shop pages, and
  `og:type=product` / `og:type=article` where relevant.

**New content surface**

- Added a **`/blog` (Guides)** section — server-rendered, bilingual-aware,
  linked from the header, mobile menu and footer, and included in the sitemap.
  This is the home for informational keywords the catalog can't target. Four
  launch posts (see §4).

**Internal linking**

- Footer now exposes crawlable links to Browse, Wholesale and Guides.
- Blog posts link down into category and browse pages with descriptive anchors.

## 3. Per-page keyword map

Intent key: **N** = navigational, **C** = commercial/transactional,
**I** = informational.

| Page (route) | Primary keyword | Secondary keywords | Intent |
|---|---|---|---|
| Home `/$locale/` | online flower shop Sri Lanka | flower delivery Sri Lanka, buy flowers online Sri Lanka | C/N |
| Browse `/$locale/products` | buy flowers online Sri Lanka | fresh flowers Sri Lanka, retail & wholesale flowers | C |
| Wholesale view `/$locale/products?type=wholesale` | wholesale flowers Sri Lanka | bulk flowers Colombo, flower supplier Sri Lanka | C |
| Category — Wedding `/c/wedding` | wedding flowers Sri Lanka | bridal bouquet, wedding centrepieces | C |
| Category — Funeral `/c/funeral` | funeral flowers Sri Lanka | condolence wreaths, sympathy flowers | C |
| Category — Bouquets `/c/bouquets` | flower bouquet Sri Lanka | gift bouquet, birthday flowers | C |
| Category — Roses `/c/roses` | roses Sri Lanka | red roses, rose bundle wholesale | C |
| Category — Gerberas `/c/gerberas` | gerbera flowers Sri Lanka | gerbera daisies per stem | C |
| Category — Orchids `/c/orchids` | orchids Sri Lanka | Dendrobium, Sonia orchids | C |
| Category — Chrysanthemums `/c/chrysanthemums` | chrysanthemums Sri Lanka | chrysanthemum stems bulk | C |
| Category — Garlands `/c/garlands` | flower garlands Sri Lanka | ceremony garland, welcome garland | C |
| Category — Poya/Temple `/c/poya-temple` | temple flowers Sri Lanka | poya flowers, flowers for offering | C |
| Category — Loose flowers `/c/loose-flowers` | loose flowers Sri Lanka | flowers by the bunch, décor flowers | C |
| Category — Plants `/c/plants` | potted plants Sri Lanka | seedlings, garden plants | C |
| Shop `/shops/$slug` | `{shop name}` + `{florist/grower in district}` | flowers `{district}`, florist near me | N/C |
| Product `/products/$slug` | `{product name}` + `{category}` | long-tail product + district | C |
| **Guide — Wedding** `/blog/wedding-flowers-sri-lanka-guide` | wedding flowers Sri Lanka | bridal bouquet Sri Lanka, wedding flower prices | I→C |
| **Guide — Freshness** `/blog/how-to-keep-cut-flowers-fresh` | how to keep flowers fresh | make cut flowers last longer, flower care tips | I |
| **Guide — Wholesale** `/blog/buying-wholesale-flowers-sri-lanka` | wholesale flowers Sri Lanka | Manning Market flowers, bulk flowers Colombo | I→C |
| **Guide — Poya** `/blog/flowers-for-poya-and-temple-offerings` | poya flowers | temple flowers Sri Lanka, lotus flowers | I |

> The two guides sharing a primary keyword with a category/browse page
> (`wedding`, `wholesale`) are deliberate: the **guide** captures the
> informational query and funnels the reader to the **commercial** page with an
> in-content link. Keep the guide's `<title>` phrased as a guide ("…Guide",
> "…: Grower-Direct vs Manning Market") so it doesn't compete head-to-head.

## 4. Content plan (launch posts)

All four are live in `apps/web/src/content/posts.ts`:

1. **Wedding Flowers in Sri Lanka: The Complete Planning Guide** — captures
   high-intent wedding research; links to `/c/wedding` and wholesale.
2. **How to Keep Cut Flowers Fresh Longer in Sri Lanka's Heat** — evergreen
   care query; links to hardy-flower categories.
3. **Buying Wholesale Flowers in Sri Lanka: Grower-Direct vs Manning Market** —
   B2B intent (florists, planners); links to wholesale + rose/gerbera/mum.
4. **Flowers for Poya Days & Temple Offerings** — seasonal, culturally specific;
   links to `/c/poya-temple`, `/c/loose-flowers`, `/c/garlands`.

### Backlog ideas (next)

- "Funeral & Condolence Flowers in Sri Lanka: What to Send" → `/c/funeral`
- "Best Flowers for Sri Lanka's Climate (and How Long They Last)"
- "Avurudu & New Year Flowers: A Buyer's Guide" (seasonal, April)
- District landing angle: "Flower Delivery in Colombo / Kandy / Galle" — only
  build these when there's real shop supply per district (avoid thin pages).

## 5. Publishing checklist (per new page/post)

- [ ] One primary keyword, not already owned by another page (check §3 table)
- [ ] `<title>` ≤ ~60 chars, keyword near the front, brand suffix
- [ ] Meta description 150–160 chars, compelling, includes the keyword naturally
- [ ] Exactly one `<h1>`; `<h2>`/`<h3>` use secondary keywords
- [ ] 2+ internal links with descriptive anchor text
- [ ] `hreflang` + canonical (handled by `hreflangLinks()` — pass the un-prefixed path)
- [ ] Appropriate JSON-LD (`BlogPosting` for posts, `Product`/`ItemList` for catalog)
- [ ] Added to `sitemap.xml` (automatic for catalog + posts; manual for new static routes)
- [ ] Update the table in §3

## 6. Off-page / technical follow-ups (not code)

- Verify the production domain in **Google Search Console** and submit
  `https://flowermarket.lk/sitemap.xml`.
- Set up **Bing Webmaster Tools** likewise.
- Create a **Google Business Profile** for the brand (helps the `Organization`
  entity + local intent).
- Watch **Core Web Vitals** in Search Console; the app is SSR so LCP should be
  healthy — keep hero images optimised.
- Add `sameAs` social profile URLs to `organizationJsonLd()` once accounts exist.
