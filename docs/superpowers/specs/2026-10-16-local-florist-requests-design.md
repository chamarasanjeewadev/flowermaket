# Local Florist Requests — Design

Date: 2026-10-16 · Status: draft for review

## 1. Goal

A customer designs a bouquet in a few steps, says where and when it is needed and
what they want to spend, and **florists near the delivery point** send prices.
The customer compares quotes (with each shop's Google rating), accepts one, and
pays the shop directly. The shop gets the order on WhatsApp.

Positioning: buy from a florist near you, so flowers are fresher and arrive
sooner than a bouquet shipped from Colombo, and the money goes to local shops.
(Competitor reference: Shirohana's "4 simple steps" builder ad. We don't name
them on our pages.)

Success at launch:
- A customer can go from `/design` to a submitted, phone-verified request in
  about 3 minutes on mobile.
- Each request reaches every opted-in registered florist within range
  automatically. Unclaimed Google-listed florists are reached after operator
  approval.
- Every lead delivered, viewed, quoted and accepted is logged per shop, so a paid
  model can be chosen later.
- Operators and AI agents can run the whole flow through the `flowers` MCP.

Out of scope: payments through us (PayHere), our own reviews and ratings,
completion tracking, billing shops, delivery logistics.

## 2. Decisions (from the 2026-10-08 interview)

| Area | Decision |
|---|---|
| Shop pool | Registered shops plus Google-imported "unclaimed" florists, who are invited to claim a shop |
| Nearby | GPS radius: shop lat/long plus the customer's delivery point. Start at 10 km and widen to 25 km if fewer than 3 shops are found. At most 8 shops per request |
| Builder | Extend `/design`: flowers → fillers → wrapping → add-ons → delivery and budget → verify phone |
| Prices | Customer picks a budget range only. No per-flower prices shown |
| Shop reply | Signed magic link in WhatsApp opens a one-page quote form. No login |
| Customer | No account. WhatsApp number verified by OTP. Private request page. The shop gets the customer's contact only after acceptance |
| Payment | Customer pays the shop directly. We confirm the order and exchange contacts |
| Reliability | Google rating and review count (with Google attribution) from the official Places API |
| Broadcast | Automatic to opted-in registered shops. Unclaimed and invited listings wait for operator approval |
| Paid model | Undecided. Log every lead event per shop |
| SEO | New `/local-florists` page and one blog post |
| MCP | Monitor, approve and route, shop discovery, act for parties |

## 3. Architecture

Approach: a **florist directory plus separate request tables**. `shops` stays
"real accounts only", so the catalogue, moderation, RFQ and sitemap code don't
change. The existing order/RFQ system is not reused, because it is per-line,
admin-awarded and margin-based, while this flow is one bouquet price that the
customer chooses.

```
customer (/design steps) ──► bouquet_requests ──match──► florist_listings (geo, Google data, opt-out)
                                   │                          │ shop_id (when registered/claimed)
                                   ▼                          ▼
                         bouquet_request_offers ◄────── shops (notification_phone, consent, verified)
                         (one per shop contacted = lead log)
                                   │
           WhatsApp (Evolution / Twilio template via existing dispatcher)
                                   │
         florist magic-link quote page ──► offer.quoted ──► customer request page ──► accept
```

Depends on the uncommitted supplier-workflow change (migration 0023:
`shops.notification_phone / notification_consent_at / notification_verified_at /
notification_language`, `sendSupplierNotification`). **That work must be
committed, and 0023 applied in prod, before this ships.**

## 4. Data model — migration `0024_local_florist_requests.sql`

This is a custom additive migration, handled like 0018–0023: it is applied by
hand in prod (see migration-journal-drift) and the Drizzle schema files are
updated to match. Every new table enables RLS, adds `CREATE POLICY … FOR ALL TO
postgres`, and revokes access from anon and authenticated (as in 0011/0023).

### `florist_listings` — every florist we know about
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| google_place_id | text unique null | stored indefinitely (allowed by Google's terms) |
| shop_id | uuid unique null → shops | set when registered or claimed |
| name | text | |
| phone | text null | canonical 94XXXXXXXXX |
| address, district, city | text | district = the existing district slug |
| lat, lng | double precision | |
| location_source | text | `google` \| `owner` \| `admin` |
| google_rating | real null | 1.0–5.0 (not money, so float is fine) |
| google_review_count | integer null | |
| google_maps_uri | text null | link shown next to the rating |
| google_synced_at | timestamptz null | |
| status | text | `unclaimed` \| `invited` \| `claimed` \| `opted_out` \| `blocked` |
| supplier_invite_id | uuid null → supplier_invites | latest claim invite |
| opted_out_at | timestamptz null | set when they reply STOP; never contacted again |
| created_at, updated_at | timestamptz | |

Indexes: `(lat, lng)` btree for a bounding-box prefilter, `status`, `district`.

A registered shop takes part only if it has a linked listing with a location. In
admin or MCP, an operator links a Google place or sets a pin by hand.

### `bouquet_requests`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| ref | text unique | `LR-` + 6 chars, used in WhatsApp text |
| access_token_hash | text unique | customer page link `/r/{token}`; we store only the SHA-256 hash |
| status | text | `pending_verification` → `open` → `accepted` \| `expired` \| `cancelled` → `completed` |
| customer_name | text | |
| customer_phone | text | canonical; never shown to shops before acceptance |
| phone_verified_at | timestamptz null | |
| language | language enum | en \| si; used for every customer message |
| design | jsonb | `{ flowers:[{flowerId,nameEn,qty}], fillers:[…], wrapping, addons:[…], cardMessage?, notes?, previewImagePath? }` (typed in `@flowers/api`) |
| occasion | text null | from a fixed list |
| budget_min_cents, budget_max_cents | integer | from fixed bands (§6.1), integer LKR cents |
| fulfilment | text | `delivery` \| `pickup` |
| delivery_lat, delivery_lng | double precision | |
| delivery_area | text | suburb/city label, the only location shops see before acceptance |
| delivery_address | text null | full address, revealed to the accepted shop only |
| needed_on | date | |
| needed_window | text | `morning` \| `afternoon` \| `evening` \| `any` |
| radius_km | integer | 10, or 25 after widening |
| quote_deadline_at | timestamptz | default: 24 h after open, or 2 h before the start of `needed_window` on `needed_on` if that is sooner, with a minimum of 1 h |
| accepted_offer_id | uuid null | |
| utm | jsonb null | attribution |
| created_at, updated_at | timestamptz | |

Guard: a phone number can have at most 3 `open` requests at once.

### `bouquet_request_offers` — one per shop contacted (also the lead log)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| request_id | uuid → bouquet_requests (cascade) | |
| listing_id | uuid → florist_listings | |
| shop_id | uuid null → shops | snapshot at send time |
| distance_m | integer | |
| status | text | `pending_approval` → `sent` \| `send_failed` → `viewed` → `quoted` \| `declined` → `accepted` \| `not_selected` \| `expired` (`skipped` = operator rejected the send) |
| token_hash | text unique | shop magic link `/lead/{token}`; we store only the SHA-256 hash |
| price_cents | integer null | bouquet price |
| delivery_fee_cents | integer not null default 0 | |
| ready_at | timestamptz null | when they can deliver or have it ready |
| message | text null | ≤ 500 chars |
| photo_path | text null | optional example photo (storage bucket `lead-photos`) |
| decline_reason | text null | |
| sent_at, viewed_at, quoted_at, accepted_at | timestamptz null | lead-event timestamps for future billing |
| notification_status, notification_error, provider_id | text null | same shape as rfqs |
| created_at, updated_at | timestamptz | |

Unique `(request_id, listing_id)`. Money is integer cents with
`CHECK (price_cents > 0)` and `CHECK (delivery_fee_cents >= 0)`.

Customer OTP: generalise `documentAccess` (hashOtp, signed cookie, attempt
limits) into a small `phoneAccess` helper keyed by `(kind, id)`, so requests use
the same HMAC (`DOC_ACCESS_SECRET`) and limits as documents without a second
implementation. The document flow keeps its behaviour, and its existing tests
must still pass.

## 5. Matching (pure, unit-tested)

`selectFloristsForRequest(candidates, request) → { autoSend[], needsApproval[] }`
in `packages/api/src/local-requests/matching.ts`:

1. Candidates come from a Drizzle query: a bounding box around the delivery
   point at 25 km, `status` not in (`opted_out`, `blocked`), and a phone present.
   Haversine distance is computed in TypeScript, not SQL.
2. Keep listings within 10 km. If fewer than 3, use 25 km (`radius_km = 25`).
3. **Auto-send:** listing has `shop_id`, the shop is active, is a `florist`
   seller type, and has `notification_consent_at` and `notification_verified_at`.
4. **Needs approval:** everything else in range (unclaimed or invited).
5. Order: auto-send first, then by distance, with Google rating breaking ties.
   Cap at 8 in total.
6. If nothing is in range, the request still opens. The operator sees it
   flagged "no florists in range" and the customer page says we're finding
   shops.

## 6. Customer flow (apps/web)

### 6.1 Builder — extend `/$locale/design`
Steps in a progress bar (mobile-first, same look as today):
1. **Blooms**: the existing flower picker.
2. **Fillers & greenery**: flowers from a `fillers` flower category, managed in
   admin like other flower categories. The step can be skipped.
3. **Wrapping**: a fixed list in code (kraft paper, cellophane, cloth/jute,
   box, basket, "florist's choice"), bilingual, no prices.
4. **Add-ons**: a card with a message, chocolates, teddy, balloon, vase. These
   are checkboxes, and the shop prices them in its quote.
5. **Delivery & budget**: delivery or pickup; location via "Use my location"
   or a search box backed by Places Autocomplete through our server function,
   so the key stays server-side; date and time window; occasion; budget bands:
   Under Rs 3,000 · 3,000–5,000 · 5,000–10,000 · 10,000–20,000 · 20,000+. The
   bands are input ranges, not price claims.
6. **Your details**: name and WhatsApp number → OTP over WhatsApp → verify →
   request `open` → redirect to the request page.

The AI preview stays optional. If it was generated, the image is attached to
the request. The old "Send on WhatsApp" button stays as a secondary action.
The design draft lives in the existing localStorage pattern, so a refresh
doesn't lose it.

### 6.2 Request page `/$locale/r/$token` (noindex)
- Access needs the token plus a signed cookie. On a new device the customer
  re-verifies by OTP.
- It shows the design summary, status, deadline countdown, and the shops
  contacted ("8 florists near Kurunegala are looking at your request").
- **Quote cards**: shop name, distance, ★ Google rating (number of reviews)
  with "Google" attribution and a Maps link, a Verified badge when
  `shops.verification_status = verified`, price + delivery fee = total, ready
  time, message, photo. Sorted by total price, with a toggle for rating.
- **Accept** opens a confirm sheet ("You'll pay {shop} directly, Rs X"). The
  offer becomes `accepted`, the others `not_selected`, and the request
  `accepted`, in one transaction. The customer then sees the shop's name,
  phone, WhatsApp link and address.
- The customer can cancel while the request is `open`.

### 6.3 Customer WhatsApp messages (language = request.language)
- The OTP code.
- "Request LR-XXXX sent to N florists near {area}" with the page link.
- On the **first** quote: "You have a quote", with the link. After that, at most
  one "N quotes so far" message per 2 hours while the request is open. No cron:
  this is checked when a quote is saved.
- On acceptance: the shop's contact details and a reminder to pay the shop
  directly.

## 7. Florist flow

### 7.1 Notification (WhatsApp)
- **Registered** shops are notified through the existing `sendSupplierNotification`
  (Evolution by default; Twilio template if configured, using new optional vars
  `LOCAL_REQUEST_TEMPLATE_EN/SI` with variables 1 = shop name, 2 = ref,
  3 = summary, 4 = link). With no template configured, it fails closed exactly
  like the supplier alerts do today.
- **Unclaimed** listings get an intro message once an operator approves it:
  who we are, the request summary (area, date, occasion, budget band) and the
  link, plus "Reply STOP and we won't message you again". The webhook marks a
  STOP reply as `opted_out`.
- Message builders live in `@flowers/integrations/local-requests.ts` (pure and
  unit-tested, en + si).

### 7.2 Quote page `apps/supplier` route `/lead/$token` (public, noindex)
- No login. The token is checked by hash, and the page refuses quotes after
  `quote_deadline_at` or once the request is no longer `open`.
- It shows the design, an AI preview if there is one, the delivery area and
  distance (no exact address), the date and window, the budget band and the
  add-ons.
- Form fields: price (Rs, converted to cents), delivery fee, ready-by
  date and time, message, optional photo. Or **Decline** with a reason
  (busy / out of stock / too far / budget too low / other). The shop can revise
  its quote until the deadline; we keep the latest only.
- The first open sets `viewed_at`.
- After quoting, an unclaimed listing sees a "Claim your free shop" CTA, which
  creates or uses a `supplier_invites` row tied to the listing so registration
  links them (`status = claimed`, `shop_id` set).
- On acceptance, the shop gets the customer's name, phone, full address, the
  design and the agreed total on WhatsApp. Shops that weren't selected get a
  short "customer chose another florist" message.

## 8. Admin (apps/admin)

- **Local requests** list (filters: open / needs approval / no florists /
  accepted) and detail: offers with status, approve or skip pending offers, add
  a listing manually, widen the radius, nudge (resend), cancel, mark completed.
- **Florist directory**: search Google Places (text plus area, or near a
  point), import results, link a listing to a shop, set a pin manually, refresh
  Google data, send a claim invite (exact text previewed before sending, as
  with existing invites), set opted-out or blocked.
- Every send goes through the existing preview-then-send pattern.

## 9. Google Places integration

- `packages/integrations/src/places.ts` (client-safe types, fetch-based):
  `searchFlorists(text|nearby)`, `getPlaceDetails(placeId)` and
  `autocomplete(input, sessionToken)`, using Places API (New) with explicit
  field masks (id, displayName, formattedAddress, location,
  nationalPhoneNumber, rating, userRatingCount, googleMapsUri).
- New secret `GOOGLE_PLACES_API_KEY` for web (autocomplete only), admin and
  MCP. **Use a dedicated key restricted to Places API (New)**, not the shared
  Gemini key.
- Refresh: an admin/MCP "refresh stale listings" action re-fetches anything with
  `google_synced_at` older than 30 days. The daily-ops-briefing skill reports
  how many are stale. No cron.
- **⚠ Terms decision needed (see §14):** Google's terms allow storing the place
  ID indefinitely and lat/lng for up to 30 days. Caching other Place content
  such as the rating and review count is more restricted. This spec stores
  the rating with a ≤30-day refresh. The stricter alternative is to fetch rating
  and count live when a request page renders, cached briefly per request. That
  costs more per view and isn't strictly cache-free either. We don't store
  review text.

## 10. MCP (`packages/mcp/src/tools/local-requests.ts`)

| tool | kind |
|---|---|
| `list_local_requests` (status, needs-approval, no-florists, date range) | read |
| `get_local_request` (offers, quotes, timeline) | read |
| `list_florist_listings` (near lat/lng or district, status, has shop) | read |
| `search_google_florists` (text/area or near point; no DB change, Places cost) | read |
| `import_florist_listing` (place_id → listing) | write |
| `link_listing_to_shop`, `set_listing_location`, `set_listing_status` | write |
| `refresh_florist_ratings` (stale or given ids) | write |
| `widen_request_radius`, `cancel_local_request`, `mark_local_request_completed` | write |
| `record_quote_for_shop` (quote a florist gave on WhatsApp/phone) | write |
| `approve_request_offers` (send to pending listings) | send |
| `add_listing_to_request` (create offer + send) | send |
| `nudge_offer` | send |
| `invite_florist_listing` (claim invite) | send |
| `accept_quote_for_customer` (customer asked by WhatsApp; notifies both) | send |

Read tools are added to the `.claude/settings.json` allowlist. Send tools return
the exact text in their description and result, following the project rule that
the operator approves the text. Also: a new skill `.claude/skills/local-request-desk`
(triage open requests, approve sends, chase quotes, import florists for empty
areas), and a "Local requests" section in `daily-ops-briefing`.

## 11. SEO + content

**Page `/$locale/local-florists`** (indexable, en + si)
- Primary keyword "local florist near me Sri Lanka". Secondary: "same-day flower
  delivery Sri Lanka", "florist near me", "flower delivery {district}".
- Title: "Local Florists Near You in Sri Lanka | FlowerMarket.lk".
  One H1. Sections: how it works (3 steps), why order from a florist near you
  (fresher, shorter trip; no guaranteed delivery times), districts with live
  florist counts (real numbers from the DB, and only districts that have at
  least one listing, to avoid thin pages), FAQ, and a CTA into `/design`.
- JSON-LD: `WebPage` + `FAQPage` + `BreadcrumbList`. hreflang via
  `hreflangLinks("/local-florists")`. Added to sitemap static routes.
  Internal links from the home page, `/design`, `/fresh-flowers-near-me`, the
  footer, and the blog post.
- Update the §3 keyword map in `docs/seo-strategy.md`.

**Blog post** (`content/posts.ts`, English, and Sinhala if the posts system
supports it at implementation time)
- Slug `local-florist-vs-colombo-flower-delivery`. Title "Local Florist or Colombo
  Delivery? How to Get Fresher Flowers in Sri Lanka".
- Primary keyword "local florist vs online flower delivery Sri Lanka", which is
  informational and distinct from the page's keyword.
- Outline: what happens to a bouquet shipped across the island; what to ask a
  local florist; how to brief a custom bouquet (blooms, fillers, wrapping,
  budget); how to judge a shop (Google rating, review count, photos of their
  work); how FlowerMarket's request flow works, with a CTA.
- No invented statistics. Any vase-life or transit claim needs a cited source,
  or it is phrased as general guidance.

**Analytics** (`lib/analytics.ts`): `local_request_step` (step n),
`local_request_submitted` (budget band, district, florists matched),
`local_quote_viewed`, `local_quote_accepted`. Add these to
`docs/analytics-tracking-plan.md`.

## 12. Errors, abuse, privacy

- OTP limits and attempt lockout are reused from documentAccess. There is also
  a honeypot field and a cap of 3 open requests per phone.
- Tokens are 32 random bytes, stored only as hashes and never logged. Customer
  phone numbers never appear in URLs.
- If a WhatsApp send fails, the offer becomes `send_failed`. The operator sees
  it and can retry. The customer page counts only shops that were actually sent
  the request.
- Opted-out or blocked listings are never selected, even manually (the tool
  refuses).
- Expiry is computed when records are read (`open` past the deadline with no
  acceptance → shown and treated as `expired`), and persisted the next time the
  record is written.
- Places API failure: autocomplete falls back to "Use my location" or a free-text
  area with district select (geocoded on the server, or the district centroid
  from a static table).

## 13. Testing

- Unit (vitest): haversine and `selectFloristsForRequest` (radius widening, cap,
  ordering, exclusion rules); budget bands; quote deadline calculation; offer
  and request state transitions (accept is exclusive; no quotes after the
  deadline); token hashing; message builders en/si; Places response parsing;
  `phoneAccess` (plus the existing documentAccess tests unchanged).
- Repo tests follow the existing `packages/api` pattern.
- Manual E2E on local dev with `AUTH_DISABLED=1` and WhatsApp in dry-run (logged,
  not sent): build → OTP → match → quote via two magic links → accept. Then MCP
  tools run against a rolled-back prod transaction, as was done for order
  fulfilment.

## 14. Open items for review

1. **Google data storage.** Do we cache rating/count with a ≤30-day refresh
   (this spec), or fetch them live at display time? Please confirm your risk
   tolerance. I have not had this checked legally.
2. **Messaging unclaimed shops** from our Evolution (unofficial) number risks
   WhatsApp flagging the number. Operator approval and STOP handling reduce the
   risk. A Twilio-approved template for first contact is safer. Which do we use
   at launch?
3. **Prerequisite:** the uncommitted supplier-workflow change (0023) has to be
   committed first.

## 15. Delivery phases (for the plan)

1. Schema 0024 + Places integration + florist directory (admin + MCP discovery
   tools). This can ship alone and starts filling the directory.
2. Builder steps, request creation with OTP, matching, notifications.
3. Florist quote page, customer request page, accept flow, MCP request and party
   tools, skill.
4. `/local-florists` page, blog post, analytics, seo-strategy update.
