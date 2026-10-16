# Local Florist Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers design a bouquet, nearby florists (registered and Google-listed) quote through a WhatsApp magic link, the customer accepts one quote and pays the shop directly. The whole flow can be operated through admin and the `flowers` MCP.

**Architecture:** There are three new tables: `florist_listings` (a geo directory with Google data), `bouquet_requests`, and `bouquet_request_offers` (one row per shop contacted, which also serves as the lead log), plus `bouquet_request_otps`. Pure domain logic (geo, matching, deadlines, state guards, tokens) lives in `packages/api/src/local-requests/`, exposed through the client-safe subpath `@flowers/api/local-requests`. DB repos live in `packages/api/src/repos/`. WhatsApp sending is injected into repos as a function, so the same repo code serves web, admin and MCP. `shops`, the catalogue and the RFQ/order code are untouched.

**Tech Stack:** TanStack Start (React 19) on Cloudflare Workers, Drizzle + Supabase Postgres, vitest, Google Places API (New) over `fetch`, Evolution GO / Twilio through the existing `sendSupplierNotification`, MCP SDK + zod.

**Spec:** `docs/superpowers/specs/2026-10-16-local-florist-requests-design.md`

## Global Constraints

- Money is integer LKR cents everywhere (DB, DTOs, MCP inputs). Use `formatRupees(cents)` from `@flowers/api` for display.
- No `any`, no raw SQL outside `0024_local_florist_requests.sql`. All queries go through Drizzle. Distance is computed in TypeScript, never SQL.
- Call `getEnv()` / `createDb()` / `tryCreateDb()` only inside handlers, never at module scope.
- Client code must not import the `@flowers/api` barrel. Use `@flowers/api/local-requests` (pure) or server functions (see memory no-db-barrel-in-client).
- `@flowers/integrations` never imports `@flowers/api`.
- Each new table: `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY … FOR ALL TO postgres USING (true) WITH CHECK (true)`, and `REVOKE ALL … FROM anon, authenticated` (mirror 0011/0023).
- User-visible copy is en + si. si falls back to en. Customer messages use `bouquet_requests.language`. Shop messages use `shops.notification_language`, or `en` for unclaimed listings.
- Never send WhatsApp without the operator approving the exact text in admin/MCP. Automatic sends are allowed only for: customer OTP, customer confirmations, and requests to opted-in, verified registered shops (spec §2).
- Constants (spec §2/§5/§6): radius 10 km → 25 km if fewer than 3; max 8 florists; budget bands Under Rs 3,000 · 3,000–5,000 · 5,000–10,000 · 10,000–20,000 · 20,000+; at most 3 open requests per phone; customer quote digest at most once per 2 h.
- Google: store `place_id` indefinitely; refresh lat/lng/rating/count when `google_synced_at` is older than 30 days; never store review text; always show "Google" attribution plus the Maps link next to a rating.
- New secret `GOOGLE_PLACES_API_KEY` (a dedicated key restricted to Places API (New)) for web, admin and MCP. Optional vars `LOCAL_REQUEST_TEMPLATE_EN/SI` (Twilio).
- Prod migrations are applied by the user via `psql`. Never run `db:migrate` against prod (memory migration-journal-drift).

**Refinements to the spec, made while planning** (also apply them to the spec in Task 1):
1. Request OTPs use their own table `bouquet_request_otps` and reuse the *exported pure* helpers from `documentAccess.ts` (`generateOtpCode`, `hashOtp`, `otpVerdict`, `signDocCookie`, `verifyDocCookie`). There is no second crypto implementation, and `documentAccess` is unchanged.
2. `quote_deadline_at` closes *quoting* only. A customer may still accept a received quote until the end of `needed_on` (Asia/Colombo). After that, the effective status is `expired`.
3. `budget_max_cents` is nullable (the 20,000+ band). New column `customer_notified_at` drives the 2 h digest throttle.
4. If there is no GPS pin, the customer enters an area plus district, and the server geocodes it with Places Text Search. If that fails, the form asks them to use "Use my location".

## Review Focus

1. **Double accept**: two taps on Accept, or two tabs. Exactly one offer ends `accepted`, and the second call returns `conflict`. Pinned in Task 13.
2. **Late or closed quotes**: a florist submits after the deadline, or after the request was accepted or cancelled. The submission is rejected, and the quote page shows "This request is closed". Pinned in Task 6 (`canQuote`) and Task 12.
3. **Phone formats**: `0771234567`, `+94 77 123 4567` and `94771234567` are the same person for OTP, the 3-open cap, STOP opt-out and listing dedupe. Pinned in Task 3 (`listingFromPlace`), Task 8 and Task 14.
4. **Rupee input**: `"4,500"` → 450000, `"4500.5"` → 450050, while `"0"`, `"-5"`, `""` and `"abc"` are rejected. The price is never stored as a float. Pinned in Task 6 (`parseRupeesToCents`).
5. **No florists in range** (or all opted out): the request still opens with `noFloristsInRange: true`, the customer page shows "We're finding florists near you", and admin/MCP list it under the no-florists filter. Pinned in Task 9.

---

## Phase 0 — Prerequisite

### Task 0: Branch on top of the supplier-workflow change

- [ ] **Step 1:** Run `git status --short`. If the supplier-workflow files (`packages/db/migrations/0023_supplier_workflow.sql`, `packages/api/src/supplier-workflow.ts`, …) are still uncommitted, **stop and ask the user** to commit them (they are another session's work). Don't commit them yourself.
- [ ] **Step 2:** `git switch -c feat/local-florist-requests` from the commit containing 0023.
- [ ] **Step 3:** Run `pnpm build && pnpm typecheck && pnpm test`. Expected: all green. This is the baseline; record any pre-existing failures in the task report.

---

## Phase 1 — Directory and Google Places (can ship alone)

### Task 1: Schema + migration 0024

**Files:**
- Create: `packages/db/src/schema/local-requests.ts`, `packages/db/migrations/0024_local_florist_requests.sql`
- Modify: `packages/db/src/schema/index.ts` (add `export * from "./local-requests";`), `docs/superpowers/specs/2026-10-16-local-florist-requests-design.md` (apply the four refinements above to §4/§6/§12)

**Interfaces — Produces** (Drizzle tables, camelCase TS → snake_case SQL, columns exactly as spec §4 plus refinements):
- `floristListings`: id, googlePlaceId (unique, null), shopId (unique, null → shops), name, phone (null), address (null), district (null), city (null), lat, lng (`doublePrecision`), locationSource (text, default `'google'`), googleRating (`real`, null), googleReviewCount (int, null), googleMapsUri (null), googleSyncedAt (null), status (text, default `'unclaimed'`), supplierInviteId (null → supplier_invites), optedOutAt (null), createdAt, updatedAt. Indexes `florist_listings_lat_lng_idx (lat, lng)`, `florist_listings_status_idx`, `florist_listings_phone_idx`.
- `bouquetRequests`: id, ref (unique), accessTokenHash (unique), status (default `'pending_verification'`), customerName, customerPhone, phoneVerifiedAt, language (`language` enum), design (`jsonb.$type<BouquetDesign>()`), occasion, budgetMinCents (int not null), budgetMaxCents (int null), fulfilment, deliveryLat, deliveryLng, deliveryArea, deliveryAddress (null), neededOn (`date`, mode string), neededWindow, radiusKm (int default 10), quoteDeadlineAt (null until open), noFloristsInRange (bool default false), acceptedOfferId (uuid null, no FK to avoid a cycle), customerNotifiedAt (null), bouquetGenerationId (null → bouquet_generations), utm (jsonb null), createdAt, updatedAt. Indexes on status and customerPhone.
- `bouquetRequestOffers`: columns as spec §4. `uniqueIndex("bouquet_request_offers_req_listing_uq").on(requestId, listingId)`, plus indexes on listingId, shopId and status.
- `bouquetRequestOtps`: id, requestId (→ bouquet_requests cascade), phone, codeHash, expiresAt, attempts (int default 0), maxAttempts (int default 5), consumedAt (null), createdAt.
- The status/fulfilment/window columns are `text` with SQL `CHECK` constraints matching the unions in Task 2. `CHECK (price_cents IS NULL OR price_cents > 0)`, `CHECK (delivery_fee_cents >= 0)`, `CHECK (budget_max_cents IS NULL OR budget_max_cents > budget_min_cents)`.

- [ ] **Step 1:** Write the Drizzle schema file. Define the `BouquetDesign` interface in `packages/db/src/schema/local-requests.ts` (db must not depend on api). Task 6 re-exports it from `@flowers/api/local-requests`.
- [ ] **Step 2:** Hand-write `0024_local_florist_requests.sql`: idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ … $$` guards for constraints and policies), schema-qualified `public.`, with the RLS block from Global Constraints for all four tables. Create the storage bucket `lead-photos` (public read) with `insert into storage.buckets … on conflict do nothing`. Don't add it to `_journal.json` (same as 0018–0023).
- [ ] **Step 3:** Run `pnpm --filter @flowers/db typecheck`. Expected: PASS.
- [ ] **Step 4:** Apply to a **local/dev** database only (`psql "$DIRECT_DATABASE_URL" -f …` against a non-prod URL), then run it a second time. Expected: the second run is a no-op with no errors. If no non-prod DB is available, say so in the report. Don't touch prod.
- [ ] **Step 5:** Commit `feat(db): local florist request tables (0024)`.

### Task 2: Google Places client + notification config builder

**Files:**
- Create: `packages/integrations/src/places.ts`, `packages/integrations/src/places.test.ts`, `packages/integrations/src/notification-config.ts`, `packages/integrations/src/notification-config.test.ts`
- Modify: `packages/integrations/src/index.ts` (export both), `apps/admin/src/server/orders.ts:593` (replace the inline config literal with `notificationConfigFromEnv(env)`), `packages/api/src/env.ts` (add `GOOGLE_PLACES_API_KEY`, `LOCAL_REQUEST_TEMPLATE_EN`, `LOCAL_REQUEST_TEMPLATE_SI`)

**Interfaces — Produces:**
```ts
export interface PlaceSummary {
  placeId: string; name: string; address: string | null; phone: string | null; // national format as returned
  lat: number; lng: number; rating: number | null; reviewCount: number | null; mapsUri: string | null;
}
export type PlacesResult<T> = { ok: true; data: T } | { ok: false; message: string };
export function searchFloristsText(apiKey: string, query: string, opts?: { lat: number; lng: number; radiusM: number }): Promise<PlacesResult<PlaceSummary[]>>;
export function searchFloristsNearby(apiKey: string, lat: number, lng: number, radiusM: number): Promise<PlacesResult<PlaceSummary[]>>; // includedTypes ["florist"]
export function getPlaceDetails(apiKey: string, placeId: string): Promise<PlacesResult<PlaceSummary>>;
export function autocompletePlaces(apiKey: string, input: string, sessionToken: string): Promise<PlacesResult<{ placeId: string; text: string }[]>>; // includedRegionCodes ["lk"]
export function geocodeText(apiKey: string, text: string): Promise<PlacesResult<{ lat: number; lng: number; label: string }>>;
export function parsePlace(raw: unknown): PlaceSummary | null; // pure, exported for tests

export interface NotificationEnv { WHATSAPP_SUPPLIER_PROVIDER?: string; EVOLUTION_API_URL?: string; EVOLUTION_API_KEY?: string; EVOLUTION_INSTANCE?: string; TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string; TWILIO_WHATSAPP_FROM?: string; TWILIO_MESSAGING_SERVICE_SID?: string; }
export function notificationConfigFromEnv(env: NotificationEnv): SupplierNotificationConfig;
```
Endpoints: `https://places.googleapis.com/v1/places:searchText`, `:searchNearby`, `/v1/places/{id}`, `/v1/places:autocomplete`. Header `X-Goog-Api-Key`. `X-Goog-FieldMask` = `places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri` (no `places.` prefix for details). Never request `reviews`.

- [ ] **Step 1: Failing tests**: `parsePlace` maps a fixture `{ id:"ChIJx", displayName:{text:"Rose Florist"}, formattedAddress:"12 Main St, Kurunegala", location:{latitude:7.48,longitude:80.36}, nationalPhoneNumber:"077 123 4567", rating:4.6, userRatingCount:213, googleMapsUri:"https://maps.google.com/?cid=1" }` to the exact `PlaceSummary`; it returns `null` when `id` or `location` is missing. `searchFloristsText` with a stubbed `fetch` (`vi.stubGlobal`) sends the field-mask and key headers, and a 403 response returns `{ ok:false }` with the API error message. `notificationConfigFromEnv({ WHATSAPP_SUPPLIER_PROVIDER:"twilio", … })` gives `provider:"twilio"`, and `{}` gives `provider:"evolution"` with empty evolution strings.
- [ ] **Step 2:** Run `pnpm --filter @flowers/integrations test -- places notification-config`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement. Every function catches network errors and returns `{ ok:false }` instead of throwing.
- [ ] **Step 4:** Run the tests and `pnpm --filter @flowers/admin typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(integrations): Google Places client + shared notification config`.

### Task 3: Geo helpers + florist listings repo

**Files:**
- Create: `packages/api/src/local-requests/geo.ts`, `geo.test.ts`, `packages/api/src/local-requests/index.ts` (pure barrel), `packages/api/src/repos/florist-listings.ts`, `florist-listings.test.ts`
- Modify: `packages/api/package.json` exports (`"./local-requests": "./src/local-requests/index.ts"`), `packages/api/src/index.ts` (`export * from "./repos/florist-listings";`)

**Interfaces — Produces:**
```ts
// geo.ts
export interface LatLng { lat: number; lng: number }
export function haversineMeters(a: LatLng, b: LatLng): number;
export function boundingBox(center: LatLng, radiusKm: number): { minLat: number; maxLat: number; minLng: number; maxLng: number };
// florist-listings.ts
export type ListingStatus = "unclaimed" | "invited" | "claimed" | "opted_out" | "blocked";
export interface FloristListingDTO { id; googlePlaceId: string|null; shopId: string|null; shopName: string|null; name; phone: string|null; address; district; city; lat; lng; locationSource: "google"|"owner"|"admin"; googleRating: number|null; googleReviewCount: number|null; googleMapsUri: string|null; googleSyncedAt: Date|null; status: ListingStatus; isStale: boolean }
export function listingFromPlace(place: PlaceSummary, now: Date): NewListingValues; // pure: phone via normalizeLkPhone, district null
export function isListingStale(syncedAt: Date | null, now: Date): boolean; // > 30 days or null
export function importListingFromPlace(db: Db, place: PlaceSummary): Promise<ActionResult<{ id: string; created: boolean }>>; // upsert on google_place_id; never downgrades status, never overwrites owner/admin location
export function listListings(db: Db, f: { near?: LatLng & { radiusKm: number }; district?: string; status?: ListingStatus; hasShop?: boolean; limit?: number }): Promise<FloristListingDTO[]>; // sorted by distance when near is given
export function listingsInBox(db: Db, center: LatLng, radiusKm: number): Promise<MatchCandidate[]>; // used by Task 9; joins shops for eligibility
export function linkListingToShop(db: Db, listingId: string, shopId: string): Promise<ActionResult<void>>; // sets status 'claimed'; conflict if shop already linked
export function setListingLocation(db: Db, listingId: string, loc: LatLng, source: "owner" | "admin"): Promise<ActionResult<void>>;
export function setListingStatus(db: Db, listingId: string, status: "unclaimed" | "opted_out" | "blocked"): Promise<ActionResult<void>>; // opted_out sets optedOutAt
export function optOutByPhone(db: Db, rawPhone: string): Promise<number>; // normalizes; returns rows updated
export function refreshListingFromPlace(db: Db, listingId: string, place: PlaceSummary): Promise<ActionResult<void>>;
export function listStaleListingIds(db: Db, now: Date, limit: number): Promise<string[]>;
```
`MatchCandidate` is defined in Task 6. For this task, define it in `local-requests/matching-types.ts` as `{ listingId: string; shopId: string | null; lat: number; lng: number; googleRating: number | null; status: ListingStatus; phone: string | null; shopEligible: boolean }`, where `shopEligible` = shop is active AND `'florist' = ANY(seller_types)` AND `notification_consent_at` is not null AND `notification_verified_at` is not null AND `notification_phone` is not null.

- [ ] **Step 1: Failing tests**: Colombo Fort (6.9344, 79.8428) → Kandy (7.2906, 80.6337) gives `haversineMeters` within ±1% of 94,000 m. `boundingBox({lat:7,lng:80},10)` has `maxLat-minLat ≈ 0.1799` (±0.001). `listingFromPlace` with phone `"077 123 4567"` → `phone:"94771234567"`, `locationSource:"google"`, `status:"unclaimed"`, `googleSyncedAt:now`. `isListingStale(null, now)` → true; 29 days → false; 31 days → true.
- [ ] **Step 2:** Run `pnpm --filter @flowers/api test -- geo florist-listings`. Expected: FAIL.
- [ ] **Step 3:** Implement. `listingsInBox` filters by bounding box in SQL via Drizzle `between`, and by `status NOT IN ('opted_out','blocked')` and `phone IS NOT NULL`. Precise distance is left to the caller.
- [ ] **Step 4:** Tests pass, and `pnpm --filter @flowers/api typecheck` passes.
- [ ] **Step 5:** Commit `feat(api): florist listings directory repo + geo helpers`.

### Task 4: Admin florist directory

**Files:**
- Create: `apps/admin/src/server/florists.ts`, `apps/admin/src/routes/florists.index.tsx`
- Modify: the admin nav (where `suppliers` is linked in `__root.tsx`), and add the link "Florists"

**Interfaces — Consumes:** Task 2 places functions, Task 3 repo. **Produces (server fns, admin-guarded like `server/suppliers.ts`):** `searchGoogleFloristsFn({ query?: string; lat?: number; lng?: number; radiusKm?: number })`, `importFloristFn({ placeId })` (fetches details, then `importListingFromPlace`), `listFloristsFn(filters)`, `linkFloristToShopFn({ listingId, shopId })`, `setFloristLocationFn({ listingId, lat, lng })`, `setFloristStatusFn({ listingId, status })`, `refreshStaleFloristsFn({ limit: number /* ≤ 50 */ })`, `inviteFloristFn({ listingId, message })`. The invite reuses `createInvite` / `buildInviteMessage` / `sendSupplierNotification` with `sellerTypes:["florist"]`, sets `supplierInviteId`, and sets status `invited`. The message text comes from the admin preview (editable), the same as `suppliers.invite.tsx`.

- [ ] **Step 1:** Implement the server fns. Each returns `ActionResult` and refuses with `validation` when `GOOGLE_PLACES_API_KEY` is missing.
- [ ] **Step 2:** Implement the page: a search box (text plus optional "near lat,lng" and a radius select of 5/10/25 km), a results table with an Import button (disabled if already imported), and a directory table (name, district, ★rating (count) + "Google", status badge, linked shop, stale flag) with actions Link shop / Set pin / Opt-out / Block / Invite (dialog with editable preview text). Include a "Refresh stale (n)" button.
- [ ] **Step 3:** Run `pnpm --filter @flowers/admin build && pnpm --filter @flowers/admin typecheck`. Expected: PASS.
- [ ] **Step 4:** Manual check: `pnpm --filter @flowers/admin dev` with `AUTH_DISABLED=1` and a dev DB. Search "florist Kurunegala", import one, and confirm it appears with its rating. If you have no Places key, confirm the page shows the "Places API key not configured" error instead of crashing.
- [ ] **Step 5:** Commit `feat(admin): florist directory with Google Places import`.

### Task 5: MCP florist tools

**Files:**
- Create: `packages/mcp/src/tools/florists.ts`
- Modify: `packages/mcp/src/server.ts` (register `floristTools`), `packages/mcp/src/env.ts` (read `GOOGLE_PLACES_API_KEY`), `.claude/settings.json` (allow the read tools), `packages/mcp/README.md`, `packages/mcp/src/server.test.ts` (tool-count/kind expectations)

**Interfaces — Produces** (each defined with `defineTool`, kinds as spec §10): `list_florist_listings` (read), `search_google_florists` (read), `import_florist_listing` (write), `link_listing_to_shop` (write), `set_listing_location` (write), `set_listing_status` (write), `refresh_florist_ratings` (write; ids or `stale:true`, max 50), `invite_florist_listing` (send; input `listingId`, `message` must contain `{link}`; description tells the agent to show the exact text first; uses `sendAndLog`).

- [ ] **Step 1:** Extend `server.test.ts`: these 8 names are registered, kinds match the table above, and in read-only mode only `list_florist_listings` and `search_google_florists` are registered.
- [ ] **Step 2:** Run `pnpm --filter @flowers/mcp test`. Expected: FAIL.
- [ ] **Step 3:** Implement by delegating to the Task 3 repo and Task 2 client (no duplicated logic).
- [ ] **Step 4:** Tests pass. Then run `pnpm --filter @flowers/mcp typecheck`.
- [ ] **Step 5:** Commit `feat(mcp): florist directory tools`.

---

## Phase 2 — Requests: builder, OTP, matching, dispatch

### Task 6: Pure domain: constants, matching, rules

**Files:**
- Create: `packages/api/src/local-requests/constants.ts`, `matching.ts`, `matching.test.ts`, `rules.ts`, `rules.test.ts`
- Modify: `packages/api/src/local-requests/index.ts` (export all, plus re-export `BouquetDesign` from db)

**Interfaces — Produces:**
```ts
// constants.ts
export const LOCAL_RADIUS_KM = 10, WIDE_RADIUS_KM = 25, MIN_FLORISTS = 3, MAX_FLORISTS = 8, MAX_OPEN_REQUESTS_PER_PHONE = 3, CUSTOMER_DIGEST_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const BUDGET_BANDS = [
  { key: "under_3k", minCents: 0, maxCents: 300000 }, { key: "3k_5k", minCents: 300000, maxCents: 500000 },
  { key: "5k_10k", minCents: 500000, maxCents: 1000000 }, { key: "10k_20k", minCents: 1000000, maxCents: 2000000 },
  { key: "20k_plus", minCents: 2000000, maxCents: null },
] as const;
export type BudgetBandKey = (typeof BUDGET_BANDS)[number]["key"];
export const WRAPPING_OPTIONS = ["kraft", "cellophane", "jute", "box", "basket", "florist_choice"] as const;
export const ADDON_OPTIONS = ["card", "chocolates", "teddy", "balloon", "vase"] as const;
export const OCCASIONS = ["birthday", "anniversary", "love", "congratulations", "get_well", "sympathy", "thank_you", "wedding", "other"] as const;
export const NEEDED_WINDOWS = ["morning", "afternoon", "evening", "any"] as const; // local start hours 8, 12, 16, 8
export const DECLINE_REASONS = ["busy", "out_of_stock", "too_far", "budget_too_low", "other"] as const;
export type RequestStatus = "pending_verification" | "open" | "accepted" | "expired" | "cancelled" | "completed";
export type OfferStatus = "pending_approval" | "skipped" | "sent" | "send_failed" | "viewed" | "quoted" | "declined" | "accepted" | "not_selected" | "expired";
// matching.ts
export interface MatchedFlorist { listingId: string; shopId: string | null; distanceM: number; autoSend: boolean }
export function selectFloristsForRequest(cands: MatchCandidate[], point: LatLng): { radiusKm: 10 | 25; florists: MatchedFlorist[] };
// rules.ts
export function computeQuoteDeadline(openedAt: Date, neededOn: string, window: NeededWindow): Date;
export function endOfNeededDay(neededOn: string): Date; // 23:59:59 Asia/Colombo (UTC+05:30, no DST)
export function effectiveRequestStatus(r: { status: RequestStatus; neededOn: string }, now: Date): RequestStatus;
export function canQuote(offer: { status: OfferStatus }, req: { status: RequestStatus; quoteDeadlineAt: Date | null; neededOn: string }, now: Date): ActionResult<void>;
export function canAccept(offer: { status: OfferStatus; requestId: string }, req: { id: string; status: RequestStatus; neededOn: string }, now: Date): ActionResult<void>;
export function shouldNotifyCustomer(lastNotifiedAt: Date | null, now: Date): boolean;
export function parseRupeesToCents(input: string): number | null;
export function budgetBandFor(key: BudgetBandKey): { minCents: number; maxCents: number | null };
export function generateRequestRef(): string; // "LR-" + 6 of "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function generateAccessToken(): string; // 32 random bytes, base64url
export function hashAccessToken(token: string): Promise<string>; // SHA-256 hex via crypto.subtle
```
Matching algorithm (spec §5): compute `distanceM` for each candidate. `inner` = within 10 km. Use 25 km when `inner.length < 3`. Sort by `autoSend` desc, then distance asc, then rating desc (null last). Take 8. `autoSend = shopEligible && shopId !== null`. Candidates already excluded by the repo are not re-filtered, but the function also drops `opted_out`/`blocked`/null-phone defensively.

- [ ] **Step 1: Failing tests (matching)**: (a) 4 candidates at 2/4/6/8 km → `radiusKm:10`, 4 florists; (b) 2 within 10 km + 3 at 15–20 km + 1 at 30 km → `radiusKm:25`, 5 florists; (c) an eligible shop at 9 km sorts before an unclaimed listing at 1 km, and has `autoSend:true`; (d) 12 candidates within 10 km → exactly 8; (e) an `opted_out` candidate is never returned; (f) zero candidates → `{ radiusKm:25, florists:[] }`.
- [ ] **Step 2: Failing tests (rules)**: `computeQuoteDeadline(new Date("2026-10-16T04:00:00Z"), "2026-10-20", "morning")` → `2026-10-17T04:00:00Z`. `(…"2026-10-16T00:00:00Z", "2026-10-16", "evening")` → `2026-10-16T08:30:00Z` (16:00 local − 2 h = 14:00 local). `(…"2026-10-16T05:00:00Z", "2026-10-16", "morning")` → `2026-10-16T06:00:00Z` (1 h floor). `canQuote` returns ok for `sent|viewed|quoted|declined|send_failed`, returns `validation` for `pending_approval|skipped|accepted|not_selected|expired`, returns `validation` when `now > quoteDeadlineAt`, and returns `validation` when the request is `accepted`/`cancelled`. `canAccept` returns `conflict` when the request is already `accepted`, returns `validation` when the offer is not `quoted`, and returns ok one minute after the quote deadline but before `endOfNeededDay`. `effectiveRequestStatus({status:"open",neededOn:"2026-10-15"}, 2026-10-16T00:00Z)` → `"expired"`. `parseRupeesToCents`: `"4,500"`→450000, `"4500.5"`→450050, `"Rs 3000"`→300000, and `"0"`, `"-5"`, `""`, `"abc"`, `"1.234"` → null. `shouldNotifyCustomer(null, now)` → true; 1 h ago → false; 2 h ago → true. `generateRequestRef()` matches `/^LR-[A-HJ-NP-Z2-9]{6}$/`. Two `generateAccessToken()` calls differ and both have length 43. `hashAccessToken("x")` is 64 hex chars and deterministic.
- [ ] **Step 3:** Run `pnpm --filter @flowers/api test -- matching rules`. Expected: FAIL.
- [ ] **Step 4:** Implement. Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api): local request matching + rules`.

### Task 7: WhatsApp message builders

**Files:**
- Create: `packages/integrations/src/local-requests.ts`, `local-requests.test.ts`
- Modify: `packages/integrations/src/index.ts`

**Interfaces — Produces** (pure, `lang: "en" | "si"`, Sinhala strings written by the implementer and marked for review in the PR):
```ts
export interface RequestSummary { ref: string; area: string; distanceKm?: number; neededOn: string; window: string; occasion: string | null; budgetLabel: string; flowerLines: string[]; addons: string[] }
export function buildRequestOtpText(code: string, lang): string;
export function buildRequestOpenedText(i: { ref: string; floristCount: number; area: string; pageUrl: string }, lang): string; // floristCount 0 → "We're finding florists near {area}…"
export function buildShopRequestText(i: { shopName: string; summary: RequestSummary; leadUrl: string }, lang): string;
export function buildUnclaimedIntroText(i: { listingName: string; summary: RequestSummary; leadUrl: string }, lang): string; // must end with the STOP line
export function buildQuoteDigestText(i: { ref: string; quoteCount: number; pageUrl: string; first: boolean }, lang): string;
export function buildCustomerAcceptedText(i: { ref: string; shopName: string; shopPhone: string; totalRupees: string }, lang): string; // says "pay {shop} directly"
export function buildShopAcceptedText(i: { ref: string; customerName: string; customerPhone: string; address: string; neededOn: string; window: string; totalRupees: string; leadUrl: string }, lang): string;
export function buildShopNotSelectedText(i: { ref: string }, lang): string;
export const STOP_KEYWORDS: readonly string[]; // ["stop", "unsubscribe", "නවත්වන්න"]
export function isStopMessage(text: string): boolean; // trimmed, case-insensitive, whole message only
```
English copy that the spec fixes: the unclaimed intro ends with `Reply STOP and we won't message you again.`, and the customer accepted text contains `You'll pay {shopName} directly`.

- [ ] **Step 1: Failing tests**: every builder includes the ref and the URL it is given. `buildShopRequestText` and `buildUnclaimedIntroText` contain **no** customer phone or name (assert with a summary built from fixtures that carry a phone-like string in the area, and check that the output only contains what is passed in). The unclaimed intro ends with the STOP line in `en`. `isStopMessage(" Stop ")` → true; `"please stop by"` → false. The `si` variants are non-empty and differ from `en`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement. **Step 4:** Expected: PASS.
- [ ] **Step 5:** Commit `feat(integrations): local request WhatsApp messages`.

### Task 8: Request access (OTP + cookie)

**Files:**
- Create: `packages/api/src/repos/request-access.ts`, `request-access.test.ts`
- Modify: `packages/api/src/index.ts`

**Interfaces — Consumes:** `generateOtpCode`, `hashOtp`, `otpVerdict`, `signDocCookie`, `verifyDocCookie`, `canonicalPhone`, `phoneMatchesCustomer` from `documentAccess.ts` (all exported). **Produces:**
```ts
export function requestRequestOtp(db: Db, requestId: string, phone: string, opts: RequestOtpOpts): Promise<ActionResult<void>>; // phone must match request.customerPhone; same limits/generic errors as documents
export function verifyRequestOtp(db: Db, requestId: string, phone: string, code: string, secret: string): Promise<ActionResult<{ cookie: string; firstVerification: boolean }>>; // sets phoneVerifiedAt on first success
export function requestCookieName(requestId: string): string; // `lr_access_${requestId}`
```
The cookie is `signDocCookie(\`lr:${requestId}\`, secret)`. The `lr:` prefix means a document cookie can never validate for a request.

- [ ] **Step 1: Failing tests (pure parts)**: `requestCookieName("abc")` → `"lr_access_abc"`. A cookie signed for `lr:abc` fails `verifyDocCookie` for `lr:abd`, and also fails for bare `abc` (a document token).
- [ ] **Step 2–4:** Watch the tests fail, implement (mirror the `requestOtp`/`verifyOtp` step order, including the delete-on-dispatch-failure rule), then confirm they pass. Also run `pnpm --filter @flowers/api test -- documentAccess`. Expected: unchanged PASS.
- [ ] **Step 5:** Commit `feat(api): OTP access for bouquet requests`.

### Task 9: Request repo: create, verify, match, dispatch

**Files:**
- Create: `packages/api/src/repos/local-requests.ts`, `local-requests.test.ts`
- Modify: `packages/api/src/index.ts`

**Interfaces — Produces:**
```ts
export interface CreateRequestInput { customerName: string; customerPhone: string; language: "en" | "si"; design: BouquetDesign; occasion: Occasion | null; budgetBand: BudgetBandKey; fulfilment: "delivery" | "pickup"; point: LatLng; deliveryArea: string; deliveryAddress: string | null; neededOn: string; neededWindow: NeededWindow; bouquetGenerationId: string | null; utm: Record<string, string> | null }
export function validateCreateRequest(i: CreateRequestInput, today: string): ActionResult<CreateRequestInput>; // pure: name 2–80, design has ≥1 flower or notes ≥10 chars, neededOn ≥ today (Colombo) and ≤ today+60d, point inside Sri Lanka bbox (lat 5.85–9.9, lng 79.5–81.95), deliveryAddress required when fulfilment=delivery
export function createRequest(db: Db, i: CreateRequestInput): Promise<ActionResult<{ id: string; ref: string; accessToken: string }>>; // status pending_verification; conflict when phone already has 3 open
export type SendFn = (to: { phone: string; templateSid?: string; variables: Record<string, string> }, text: string) => Promise<{ ok: true; providerId?: string } | { ok: false; message: string }>;
export interface DispatchDeps { send: SendFn; leadUrl: (token: string) => string; pageUrl: (accessToken: string) => string; templates: { en?: string; si?: string } }
export function openRequestAfterVerification(db: Db, requestId: string, accessToken: string, now: Date, deps: DispatchDeps): Promise<ActionResult<{ floristCount: number; pendingApproval: number }>>;
export function dispatchOffers(db: Db, offerIds: string[], deps: DispatchDeps): Promise<ActionResult<{ sent: number; failed: number }>>; // offers in pending_approval|send_failed (first send) or sent|viewed (nudge); new lead token per send; success → sent
```
`openRequestAfterVerification`: in one transaction, set `open`, `quoteDeadlineAt`, `radiusKm`, `noFloristsInRange`, and insert every offer as `pending_approval` with `distanceM` and a `shopId` snapshot. **After** commit, dispatch the auto-send offers (registered shops get the template text plus variables; the phone is `shops.notification_phone`), then send the customer `buildRequestOpenedText` (counting only offers with status `sent`). Lead tokens: `generateAccessToken()`, store `hashAccessToken` in `token_hash`, and never persist or log the plain token.

- [ ] **Step 1: Failing tests (pure)**: `validateCreateRequest` rejects a past date, a date 61 days out, a point at (13.08, 80.27) (Chennai), delivery without an address, and an empty design. It accepts a valid fixture. Export `planOffers(matched: MatchedFlorist[]): { autoSendListingIds: string[]; approvalListingIds: string[] }` and test that it splits on `autoSend`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. DB functions use `listingsInBox` from Task 3 and `selectFloristsForRequest` from Task 6. A dispatch failure sets `send_failed` plus `notificationError`, and never throws.
- [ ] **Step 4:** Tests pass. Then do a DB smoke test against the dev DB inside a rolled-back transaction (a vitest file guarded by `process.env.DEV_DATABASE_URL`, skipped otherwise): create → open with 0 listings → `noFloristsInRange === true`, and the customer opened text uses `floristCount: 0` (Review Focus 5).
- [ ] **Step 5:** Commit `feat(api): create, open and dispatch bouquet requests`.

### Task 10: Builder steps on `/design`

**Files:**
- Create: `apps/web/src/components/design/steps/{StepProgress,FillersStep,WrappingStep,AddonsStep,DeliveryStep,DetailsStep}.tsx`, `apps/web/src/lib/request-draft.ts`, `apps/web/src/server/places.ts`
- Modify: `apps/web/src/components/design/BouquetDesigner.tsx`, `apps/web/src/i18n/{en,si}.ts` (new `localRequest` dict), `apps/web/src/server/catalog.ts` (`listDesignerFillers()`: variants in the flower category with slug `fillers`; empty list → the step shows "Florist's choice" only)

**Interfaces — Produces:**
- `request-draft.ts`: `useRequestDraft()` → `{ draft: RequestDraft; update(patch: Partial<RequestDraft>): void; reset(): void; hydrated: boolean }`, stored in localStorage key `fm_request_draft_v1` (try/catch, same as `lib/enquiry.tsx`). `RequestDraft` = `CreateRequestInput` fields minus phone/name, plus `step: 1..6`.
- `server/places.ts`: `autocompleteAreaFn({ input, sessionToken })` → `ActionResult<{placeId;text}[]>` (min 3 chars, max 5 results), `resolvePlaceFn({ placeId })` → `ActionResult<{lat;lng;label}>`, `geocodeAreaFn({ area, district })` → `ActionResult<{lat;lng;label}>`. All of them refuse when `GOOGLE_PLACES_API_KEY` is unset.
- The designer becomes a stepper: 1 Blooms (existing picker + optional AI preview), 2 Fillers, 3 Wrapping, 4 Add-ons (+ card message ≤ 200 chars when `card` is checked), 5 Delivery & budget (delivery/pickup toggle, "Use my location" via `navigator.geolocation` then reverse label = "Near you" + an editable area name, or area autocomplete; date input min today; window select; occasion select; budget band chips), 6 Details (Task 11). Back/Next buttons; Next is disabled until the step is valid. The old "Send to a florist on WhatsApp" button stays as a secondary link.

- [ ] **Step 1:** Implement the components and dict strings (en + si). Each step is ≤ 150 lines; the steps share `StepProgress`.
- [ ] **Step 2:** Run `pnpm --filter @flowers/web build && pnpm --filter @flowers/web typecheck`. Expected: PASS. Then `grep -r "@flowers/api\"" apps/web/src/components apps/web/src/lib`. Expected: no new barrel imports (Global Constraints).
- [ ] **Step 3:** Manual check in the browser pane at 375 px width: go through steps 1–5, reload mid-way, and confirm the draft is restored. Deny geolocation and confirm the autocomplete path still works, or that the geocode fallback message shows when no key is set.
- [ ] **Step 4:** Commit `feat(web): multi-step bouquet request builder`.

### Task 11: Submit + OTP verification (web)

**Files:**
- Create: `apps/web/src/server/local-requests.ts`
- Modify: `apps/web/src/components/design/steps/DetailsStep.tsx`

**Interfaces — Produces (server fns):** `submitRequestFn(input: CreateRequestInput & { honeypot: string })` → `ActionResult<{ requestId: string }>` (a non-empty honeypot returns a fake ok without writing; it calls `createRequest`, then `requestRequestOtp` with `buildRequestOtpText`, and keeps `accessToken` in a short-lived httpOnly cookie `lr_pending_${requestId}` (30 min) so it is never sent to the client). `verifyRequestFn({ requestId, phone, code })` → `ActionResult<{ pageToken: string }>` (on success: set the access cookie (24 h), read the pending token, call `openRequestAfterVerification` with deps built from `notificationConfigFromEnv(getEnv())` + `sendSupplierNotification`, `leadUrl = ${SUPPLIER_PORTAL_URL}/lead/${t}`, `pageUrl = ${SITE_URL}/${lang}/r/${t}`, then return the token for redirect). `resendRequestOtpFn({ requestId, phone })`.

- [ ] **Step 1:** Implement. The DetailsStep form has name, WhatsApp number, a hidden honeypot field and a submit button; then an OTP input (6 digits, resend after 60 s); then a redirect to `/$locale/r/$token`. Clear the draft on success.
- [ ] **Step 2:** Run the build and typecheck. Expected: PASS.
- [ ] **Step 3:** Manual E2E on dev with WhatsApp unconfigured: submit → the OTP send fails → the UI shows the generic error and no row stays usable. Then set `EVOLUTION_*` to a stub server, or log the code via a `LOCAL_REQUEST_DRY_RUN=1` env flag that makes `SendFn` log instead of sending (implement this flag in `server/local-requests.ts`, dev only, and refuse it when `SITE_URL` is the prod origin). Verify the code → land on the request page URL.
- [ ] **Step 4:** Commit `feat(web): submit bouquet request with WhatsApp OTP`.

---

## Phase 3 — Quotes, acceptance, operations

### Task 12: Florist quote page (supplier app, public)

**Files:**
- Create: `apps/supplier/src/server/leads.ts`, `apps/supplier/src/routes/lead.$token.tsx`
- Modify: `apps/supplier/src/routes/__root.tsx:59` (add `|| path.startsWith("/lead")` to the public paths, and noindex meta), `packages/api/src/repos/local-requests.ts` (shop-side functions), `local-requests.test.ts`

**Interfaces — Produces (repo):**
```ts
export interface LeadView { ref: string; status: "open" | "closed"; design: BouquetDesign; previewImageUrl: string | null; deliveryArea: string; distanceKm: number; fulfilment; neededOn; neededWindow; occasion; budget: { minCents: number; maxCents: number | null }; quoteDeadlineAt: Date; myQuote: { priceCents; deliveryFeeCents; readyAt; message; photoUrl } | null; declined: boolean; canClaim: boolean }
export function getLeadByToken(db: Db, token: string, now: Date): Promise<ActionResult<LeadView>>; // hashes token; first call sets viewedAt and status viewed (if sent); never returns customer name/phone/address
export interface QuoteInput { priceCents: number; deliveryFeeCents: number; readyAt: Date; message: string | null; photoPath: string | null }
export function validateQuoteInput(i: QuoteInput, req: { neededOn: string }): ActionResult<QuoteInput>; // pure: price>0, fee≥0, readyAt ≤ endOfNeededDay, message ≤ 500
export function submitQuoteByToken(db: Db, token: string, i: QuoteInput, now: Date, notifyCustomer: (requestId: string) => Promise<void>): Promise<ActionResult<void>>;
export function declineByToken(db: Db, token: string, reason: DeclineReason, now: Date): Promise<ActionResult<void>>;
export function maybeNotifyCustomerOfQuotes(db: Db, requestId: string, now: Date, send: SendFn, pageUrl: string): Promise<void>; // uses shouldNotifyCustomer + customerNotifiedAt; first quote always notifies
```
The page URL for the digest can't be rebuilt from the hash. So the digest message links to `${SITE_URL}/${lang}/r/` plus the token from a request-scoped `page_token_enc`? **Decision:** the digest link goes to `${SITE_URL}/${lang}/my-request/${ref}`. That page asks for the phone + OTP and then redirects to the cookie-authenticated view (Task 13 route `my-request.$ref`). This keeps tokens unstored.

- [ ] **Step 1: Failing tests**: `validateQuoteInput` rejects price 0, fee −1, readyAt after the needed day, and a 501-char message, and accepts a valid quote. (Review Focus 2) Using `canQuote` via `submitQuoteByToken`'s pure pre-check: export `quoteDecision(offer, req, now)` that wraps `canQuote`, and test that an accepted request → `validation` with message `"closed"`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement the repo plus server fns (`getLeadFn`, `submitQuoteFn` with the price/fee entered as rupee strings → `parseRupeesToCents`, `declineLeadFn`, `uploadLeadPhotoFn` → service-role upload to `lead-photos/{offerId}/{random}.jpg`, ≤ 5 MB, image/* only, `claimLeadFn` → create or reuse an invite and return the `/join/{token}` URL). Page: a design summary card, the area + distance, date/window, the budget band, a quote form (Rs inputs), a Decline sheet with the reasons, a closed state, and the "Claim your free shop" CTA after quoting when `canClaim`. Copy is en/si via the supplier i18n + the `?lang=` query param set in the WhatsApp link.
- [ ] **Step 4:** Tests pass. Then run `pnpm --filter @flowers/supplier build && pnpm --filter @flowers/supplier typecheck`. Manual check: open a lead link logged-out → the form renders. Submit `"4,500"` → stored 450000. Revisit after the deadline → the closed state shows.
- [ ] **Step 5:** Commit `feat(supplier): public magic-link quote page for local requests`.

### Task 13: Customer request page + accept

**Files:**
- Create: `apps/web/src/routes/$locale/r.$token.tsx`, `apps/web/src/routes/$locale/my-request.$ref.tsx`, `apps/web/src/components/local-request/{QuoteCard,AcceptSheet,RequestStatus}.tsx`
- Modify: `apps/web/src/server/local-requests.ts`, `packages/api/src/repos/local-requests.ts` (+ tests)

**Interfaces — Produces (repo):**
```ts
export interface CustomerRequestView { id; ref; status: RequestStatus; design; deliveryArea; neededOn; neededWindow; budget; quoteDeadlineAt: Date | null; floristsContacted: number; noFloristsInRange: boolean; quotes: CustomerQuote[]; accepted: { shopName; shopPhone; shopWhatsappUrl; address: string | null; totalCents } | null }
export interface CustomerQuote { offerId; shopName; distanceKm; googleRating: number | null; googleReviewCount: number | null; googleMapsUri: string | null; verified: boolean; priceCents; deliveryFeeCents; totalCents; readyAt: Date; message: string | null; photoUrl: string | null }
export function getRequestByAccessToken(db: Db, token: string, now: Date): Promise<ActionResult<CustomerRequestView>>;
export function getRequestIdByRef(db: Db, ref: string): Promise<string | null>;
export function getRequestForCustomer(db: Db, requestId: string, now: Date): Promise<ActionResult<CustomerRequestView>>;
export function acceptOffer(db: Db, requestId: string, offerId: string, now: Date): Promise<ActionResult<{ shopPhone: string; shopName: string; notSelectedOfferIds: string[] }>>;
export function cancelRequest(db: Db, requestId: string, by: "customer" | "admin"): Promise<ActionResult<void>>; // only when open
```
`acceptOffer` runs in one transaction: `UPDATE bouquet_requests SET status='accepted', accepted_offer_id=$offer WHERE id=$req AND status='open' RETURNING id`. Zero rows → `err("conflict")`. Then set the offer `accepted`, set the other `quoted|viewed|sent` offers to `not_selected`, and set `acceptedAt`. After commit, the server fn sends `buildCustomerAcceptedText`, `buildShopAcceptedText` (customer details + address, to the accepted shop's phone) and `buildShopNotSelectedText` (to the others that quoted). The shop phone is `shops.notification_phone ?? florist_listings.phone`.

- [ ] **Step 1: Failing tests**: (Review Focus 1) a pure `acceptPlan(offers, offerId)` returns the not-selected ids (only `quoted|viewed|sent` siblings). A DB test (dev-DB guarded, rolled back): two `acceptOffer` calls run with `Promise.all` on different offers → exactly one `ok`, one `conflict`, and exactly one offer has status `accepted`. `getRequestByAccessToken` for a 0-florist request → `noFloristsInRange: true`, `quotes: []`.
- [ ] **Step 2:** Run the tests. Expected: FAIL. **Step 3:** Implement the repo, server fns (`getMyRequestFn(token)`: needs the `lr_access_{id}` cookie or returns `{ gated: true, requestId }`; `requestMyRequestOtpFn`; `verifyMyRequestOtpFn`; `acceptQuoteFn`; `cancelMyRequestFn`), and pages. `r.$token` and `my-request.$ref` are both `noindex,nofollow` and share one view. Quote card: shop name, `{distance} km`, `★ 4.6 (213) · Google` linked to `googleMapsUri`, a Verified badge, a total = price + delivery breakdown, ready time, message, photo. Sort by total (toggle: rating). The accept sheet text: "You'll pay {shop} directly — Rs {total}". Statuses: open with countdown, `noFloristsInRange` → "We're finding florists near you", accepted → shop contact card with a WhatsApp button, expired/cancelled states.
- [ ] **Step 4:** Tests pass, build passes, typecheck passes. Manual E2E (dry-run sends): two lead links quote → the customer page shows 2 cards → accept one → the other lead page shows closed, and the logged dry-run messages contain the customer phone **only** in the accepted shop's message.
- [ ] **Step 5:** Commit `feat(web): customer quote comparison and acceptance`.

### Task 14: Admin local requests + STOP opt-out

**Files:**
- Create: `apps/admin/src/server/local-requests.ts`, `apps/admin/src/routes/local-requests.index.tsx`, `apps/admin/src/routes/local-requests.$requestId.tsx`
- Modify: `packages/api/src/repos/local-requests.ts` (admin functions + tests), `apps/admin/src/routes/api.whatsapp.webhook.$instance.ts` (after `recordInboundMessage`: `if (isStopMessage(parsed.text ?? "")) await optOutByPhone(db, parsed.phone)`), admin nav

**Interfaces — Produces (repo):**
```ts
export type AdminRequestFilter = "open" | "needs_approval" | "no_florists" | "accepted" | "all";
export function listRequestsAdmin(db: Db, f: { filter: AdminRequestFilter; from?: Date; to?: Date; limit?: number }, now: Date): Promise<AdminRequestRow[]>; // row: id, ref, status (effective), area, neededOn, budget, offers {total, pending, sent, quoted, declined}, createdAt
export function getRequestAdmin(db: Db, requestId: string, now: Date): Promise<ActionResult<AdminRequestDetail>>; // includes customer contact + every offer with listing, status, timestamps, notification error, quote
export function skipOffers(db: Db, offerIds: string[]): Promise<ActionResult<number>>;
export function addListingToRequest(db: Db, requestId: string, listingId: string): Promise<ActionResult<{ offerId: string }>>; // refuses opted_out/blocked listings and closed requests; computes distance
export function widenRequestRadius(db: Db, requestId: string): Promise<ActionResult<{ added: number }>>; // 10→25, adds new pending_approval offers up to 8 total
export function markRequestCompleted(db: Db, requestId: string): Promise<ActionResult<void>>; // only from accepted
export function recordQuoteForOffer(db: Db, offerId: string, i: QuoteInput, now: Date): Promise<ActionResult<void>>; // same rules as submitQuoteByToken
```
Server fns: list/get/approve (calls `dispatchOffers` after the operator sees the exact rendered texts returned by a `previewOfferTextsFn`), skip, add, widen, nudge (re-dispatch with a fresh token), cancel, complete, record quote, accept for customer.

- [ ] **Step 1: Failing tests**: (Review Focus 3) `optOutByPhone` normalization: the pure helper `normalizeLkPhone` maps `"+94 77 123 4567"`, `"0771234567"` and `"94771234567"` to the same value. Add a test asserting the webhook path uses it (unit-test an exported `handleStopReply(text, phone, optOut)` that calls `optOut` only for STOP messages). `addListingToRequest` pure guard `canAddListing(listingStatus, requestStatus)` refuses `opted_out`, `blocked` and a non-open request.
- [ ] **Step 2–4:** Watch the tests fail, implement, and confirm they pass. Run the admin build and typecheck. Manual check: the list filters work, approving shows the exact text before sending, and a dry-run dispatch updates statuses.
- [ ] **Step 5:** Commit `feat(admin): local requests console + STOP opt-out`.

### Task 15: MCP request tools + agent skill

**Files:**
- Create: `packages/mcp/src/tools/local-requests.ts`, `.claude/skills/local-request-desk/SKILL.md`
- Modify: `packages/mcp/src/server.ts`, `packages/mcp/src/server.test.ts`, `.claude/settings.json`, `.claude/skills/daily-ops-briefing/SKILL.md` (Local requests section: open without quotes, needs approval, no florists, stale listings count), `packages/mcp/README.md`, `.claude/agents/order-desk.md` (add the new tools to its tool list)

**Interfaces — Produces:** these tools, delegating to the Task 9/12–14 repos, with kinds per spec §10: `list_local_requests`, `get_local_request` (read); `widen_request_radius`, `cancel_local_request`, `mark_local_request_completed`, `record_quote_for_shop` (write; price as integer cents); `approve_request_offers`, `add_listing_to_request`, `nudge_offer`, `accept_quote_for_customer` (send). Send tools build their text with the Task 7 builders. Their descriptions say "returns the exact text; show it to the operator before calling with confirm:true". Each send tool takes `confirm: boolean` (default false). With `false`, it returns the rendered messages without sending; with `true`, it sends.

- [ ] **Step 1:** Extend `server.test.ts`: all 10 names are registered with the right kinds, and the read-only mode count is updated. A send tool called with `confirm:false` returns the preview and does not call the sender (inject a fake `Ctx` the way the existing tests do).
- [ ] **Step 2–4:** Watch the tests fail, implement, and confirm they pass, plus `pnpm --filter @flowers/mcp typecheck`.
- [ ] **Step 5:** Write `local-request-desk` SKILL.md: triage open requests, approve pending sends (show texts), chase silent shops 6 h before the deadline, import florists for districts with `no_florists`, and never accept on a customer's behalf without their WhatsApp message quoted.
- [ ] **Step 6:** Commit `feat(mcp): local request tools + local-request-desk skill`.

---

## Phase 4 — SEO, content, analytics, rollout

### Task 16: `/local-florists` landing page

**Files:**
- Create: `apps/web/src/routes/$locale/local-florists.tsx`
- Modify: `apps/web/src/server/catalog.ts` (`listFloristCountsByDistrict()` → `{ district: string; count: number }[]` counting listings with status ≠ opted_out/blocked, count ≥ 1 only), `apps/web/src/routes/sitemap[.]xml.ts` (add `localizedSitemapUrls(base, "/local-florists", { changefreq: "weekly", priority: "0.85" })`), `apps/web/src/i18n/{en,si}.ts` (`localFlorists` dict), the home page, the `/design` intro, `fresh-flowers-near-me.tsx` and the footer (one descriptive internal link each: "local florists near you")

**Interfaces:** Head per spec §11: title `Local Florists Near You in Sri Lanka | FlowerMarket.lk`, a 150–160 char description containing "local florist", `hreflangLinks("/local-florists", locale)`, `socialMeta`, and JSON-LD `WebPage` + `FAQPage` (≥ 4 Q&As taken from the on-page FAQ text) + `BreadcrumbList` via `jsonLdScript`. One H1: "Local florists near you in Sri Lanka". Sections: how it works (3 steps), why a florist near you (fresher, shorter trip, supports local shops; **no** delivery-time guarantees and **no** statistics), districts with real counts, FAQ, CTA → `/$locale/design`.

- [ ] **Step 1:** Implement. **Step 2:** Build. Then `curl -s localhost:3000/en/local-florists | grep -c '<h1'` → `1`. Confirm the JSON-LD parses (`node -e` JSON.parse on the extracted script). Confirm `/sitemap.xml` contains `/en/local-florists` and `/si/local-florists`.
- [ ] **Step 3:** Commit `feat(web): /local-florists SEO landing page`.

### Task 17: Blog post

**Files:**
- Modify: `apps/web/src/content/posts.ts` (append a `Post`)

**Interfaces:** slug `local-florist-vs-colombo-flower-delivery`; title `Local Florist or Colombo Delivery? How to Get Fresher Flowers in Sri Lanka`; primaryKeyword `local florist vs online flower delivery Sri Lanka`; secondaryKeywords `["local florist near me Sri Lanka", "custom bouquet Sri Lanka", "fresh flower delivery Sri Lanka"]`; `datePublished` = the implementation date; tag `Buying guides`; body follows the spec §11 outline with ≥ 2 internal links (`/local-florists`, `/design`) and ≥ 1 to `/fresh-flowers-near-me`. Rule: no numbers or claims that aren't sourced. A factual claim about vase life or transit either cites a named source inline, or is phrased as general guidance ("cut flowers generally last longer when…").

- [ ] **Step 1:** Write the post (~1,000–1,300 words, answer-first intro).
- [ ] **Step 2:** Run the web build. Then `curl` `/en/blog/local-florist-vs-colombo-flower-delivery` → 200, with BlogPosting JSON-LD present.
- [ ] **Step 3:** Commit `content(blog): local florist vs Colombo delivery guide`.

### Task 18: Analytics + docs

**Files:**
- Modify: `apps/web/src/lib/analytics.ts` (add `track.localRequestStep(step: number)`, `track.localRequestSubmitted(p: { budgetBand: BudgetBandKey; district: string | null; floristsMatched: number })`, `track.localQuoteViewed(count: number)`, `track.localQuoteAccepted(p: { totalCents: number; rank: number })`), call sites in Tasks 10/11/13 components, `docs/analytics-tracking-plan.md`, `docs/seo-strategy.md` (§3 table rows for `/local-florists` and the post), `CLAUDE.md` (schema-at-a-glance lines for the 3 new tables; a pointer to the spec)

- [ ] **Step 1:** Implement plus call sites. **Step 2:** Run the web build and typecheck. Manual check: in the browser pane, `window.dataLayer` shows `local_request_step` events while moving through the steps.
- [ ] **Step 3:** Commit `feat(web): local request analytics + docs`.

### Task 19: Full verification + rollout notes

- [ ] **Step 1:** Run `pnpm build && pnpm typecheck && pnpm test`. Expected: all green (compare with the Task 0 baseline).
- [ ] **Step 2:** Full dry-run E2E on dev: import 3 florists near a test point (link one to a test shop with consent + verified) → design → submit → OTP → 1 auto-send + 2 pending → approve in admin → 2 quotes via lead links (one via MCP `record_quote_for_shop` against the dev DB) → accept → messages logged correctly → `mark_local_request_completed`.
- [ ] **Step 3:** Write `docs/local-florist-requests-rollout.md`. It lists, in order, the user's steps: (1) apply `0024` with `psql` on prod; (2) `wrangler secret put GOOGLE_PLACES_API_KEY` for web, admin (and `packages/mcp/.env`); optional Twilio `LOCAL_REQUEST_TEMPLATE_EN/SI`; (3) create the `fillers` flower category in admin; (4) `pnpm deploy:web`, `deploy:supplier`, `deploy:admin`; (5) import florists for the launch districts; (6) a smoke test with their own phone. Add a memory file `local-florist-requests.md` + a MEMORY.md line.
- [ ] **Step 4:** Commit `docs: local florist requests rollout`. Then use superpowers:finishing-a-development-branch.
