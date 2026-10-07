# FlowerMarket.lk — Analytics Tracking Plan

- Tools: Google Tag Manager → GA4 (public web app `apps/web` only)
- Google account: flowermarketplacesl@gmail.com (owns both)
- GTM container: **GTM-5ZHCP658** (account "FlowerMarket.lk", id 6381177701 / container 266406727)
- GA4 property: **flowermarket.lk - Web** (property 557984938, account 411216267),
  web stream Measurement ID **G-JZ1B3YL81Q**, time zone Asia/Colombo, currency LKR
- Code: `apps/web/src/lib/analytics.ts` (`track.*` helpers push to `dataLayer`)
- Last updated: 2026-10-07

## What we want to learn

1. Which pages and categories attract visitors, and from where (organic, social, WhatsApp shares).
2. Which surface turns visitors into WhatsApp enquiries (floating button, enquiry list,
   bouquet designer, quotation generator).
3. What people search for, and which searches return few or no results (catalog gaps).
4. Which products get viewed and added but never enquired about.
5. Whether the AI bouquet designer and the quotation generator are worth investing in.

## Installation

GTM loads only in **production builds** (`import.meta.env.PROD`), so `pnpm dev` never sends
data. The container ID defaults to `GTM-5ZHCP658` in `apps/web/src/lib/analytics.ts`;
`VITE_GTM_ID` (build-time) overrides it, e.g. for a staging container.

Note: `vite preview` of a production build *does* send data to GA4 (hostname `localhost`).

Page views come from GA4 enhanced measurement ("Page changes based on browser history
events" — on). The app does **not** push its own page_view events. Enhanced "Site search"
is **off** because the app sends its own `search` event with `result_count`.

## Events

| Event (GA4) | Fired when | Key params | Code |
|---|---|---|---|
| `view_item` | Product detail page opens | ecommerce.items (id, name, category, shop, retail/wholesale), value | `products.$slug.tsx` |
| `view_item_list` | Category page / browse / search results load | item_list_id (`category_<slug>`, `browse`, `search_results`), items | `c.$slug.tsx`, `products.index.tsx` |
| `search` | Browse loaded with a `q` term | search_term, result_count | `products.index.tsx` |
| `add_to_cart` | "Add to enquiry" clicked | add_source (`product_card` / `product_page`), items, value | `AddToEnquiryButton.tsx` |
| `remove_from_cart` | Item removed on enquiry page | items, value | `enquiry.tsx` |
| `view_cart` | Enquiry page opened with items | items, value | `enquiry.tsx` |
| **`generate_lead`** | Any WhatsApp chat opened | lead_source (`floating_button`, `enquiry_page`, `bouquet_designer`, `quotation_generator`, `design_limit`), enquiry_item_count, value | FAB, enquiry, designer, quotation |
| `bouquet_generated` | AI bouquet generation finishes | stems, flower_count, outcome (`ok`, `rate_limited`, `error`, `unconfigured`) | `BouquetDesigner.tsx` |
| `quotation_sent` | Quotation generator → WhatsApp | line_count, value | `fresh-flower-quotation-generator.tsx` |
| `sign_up` | Email signup succeeds | method=`email` | `signup.tsx` |
| `login` | Email login succeeds | method=`email` | `login.tsx` |

Money is sent in **LKR rupees** (GA4 expects currency units), currency `LKR`.
No names, phone numbers or emails are ever pushed.

## GTM container (published as version 2, 2026-10-07)

Source of truth: `docs/gtm-container.json` (import with Admin → Import Container → Merge).

- **Google Tag - GA4** (`googtag`, `{{GA4 Measurement ID}}`) → All Pages.
- **GA4 Event - FlowerMarket events** (`gaawe`): event name `{{Event}}`, Send Ecommerce
  data = Data Layer, and every parameter below mapped from a Data Layer Variable
  (`dlv - <param>`). Fires on Custom Event regex
  `^(view_item|view_item_list|search|add_to_cart|remove_from_cart|view_cart|generate_lead|bouquet_generated|quotation_sent|sign_up|login)$`.

Because one tag forwards every parameter, `push()` in `analytics.ts` first resets all of them
to `undefined` (GTM's data-layer model otherwise keeps old values). Adding a new event or
parameter means updating **three** places: `analytics.ts` (`track` + `PARAM_KEYS`), the
container (trigger regex / DLV + tag param), and this doc.

## GA4 property setup (done 2026-10-07 unless noted)

- Time zone Asia/Colombo, currency LKR, industry Shopping.
- Event data retention: 14 months.
- Custom dimensions (event scope): Lead source (`lead_source`), Add source (`add_source`),
  Bouquet outcome (`outcome`). Custom metric: Search result count (`result_count`).
- **TODO:** mark `generate_lead` as a key event (Admin → Events → Recent events → star). GA4
  only lists an event there up to 24 h after it first arrives. Optionally also `quotation_sent`
  and `sign_up`.
- **TODO (optional):** link Google Search Console for organic query data.

## Reports to watch

- **Lead sources:** Explore → `generate_lead` by `lead_source` and landing page.
- **Funnel:** view_item → add_to_cart → view_cart → generate_lead.
- **Search gaps:** `search` where result_count = 0.
- **Top categories:** view_item_list by item_list_id.

## Not tracked (yet)

- Google sign-in (OAuth round trip; signup vs login isn't known client-side).
- Supplier and admin portals (internal, noindex).
- Actual orders and revenue happen on WhatsApp and in the admin. Those aren't in GA4.
