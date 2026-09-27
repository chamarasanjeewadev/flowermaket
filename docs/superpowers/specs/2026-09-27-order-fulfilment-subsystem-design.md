# Order-Fulfilment Subsystem — Design Spec

**Date:** 2026-09-27
**Status:** Draft for review
**Author:** brainstormed with Claude
**Phase:** pulls forward Phase 2 order lifecycle (documents-only; PayHere still deferred)

## 1. Purpose & Context

FlowerMarket takes orders informally over WhatsApp today (e.g. "100 white
roses + 15 red roses"). There is no system record, no structured way to source
from growers, and no customer paperwork. This spec defines an
**order-fulfilment subsystem** that turns a WhatsApp order into a sourced,
quoted, invoiced, and receipted transaction.

**Primary goal (decided):** build the reusable system properly; the current
WhatsApp order becomes its first real record — not a one-off manual fulfilment.

### Success criteria

1. An admin can record a WhatsApp order (customer + delivery + line items) in
   the admin portal.
2. The system auto-matches **growers that have active products in the matched
   category** (e.g. Roses) and dispatches a **request-for-quote (RFQ)** to each,
   visible in the supplier portal and pushed via a **WhatsApp nudge**.
3. Suppliers submit price + available quantity + lead time **per line item**
   (partial fills allowed) from the supplier portal.
4. The admin compares quotes and **splits each line across suppliers by
   quantity**, capturing our cost.
5. The admin issues a customer-facing **Quotation** (cost + margin → customer
   price), then an **Invoice** on acceptance, then a **Receipt** on payment.
   Documents are delivered as a **public web link + downloadable PDF**, with the
   link **gated behind a WhatsApp OTP**.
6. Payments are recorded manually (mark-paid). **No PayHere** in this phase.

### Decisions locked during brainstorming

| # | Decision | Choice |
|---|----------|--------|
| Goal | Build vs. fulfil-now | **Build the system properly** |
| Supplier channel | How RFQs reach suppliers | **In-portal RFQ + WhatsApp nudge** |
| Supplier match | Who gets the RFQ | **Match on catalog products** (growers with active products in the item's category) |
| Documents | Meaning of quote/invoice/bill | **Quotation → Invoice → Receipt**, all customer-facing; supplier costs internal |
| Payments | Integration depth | **Documents only**; PayHere stays Phase 2 |
| Award model | Split vs. single supplier | **Split per line item / quantity** |
| Customer delivery | How customer receives docs | **Public web link + PDF**, link **OTP-gated** |
| OTP delivery | Channel + mechanism | **WhatsApp OTP via Evolution API**; lightweight custom OTP, no buyer accounts |
| Document model | Immutability | **Snapshot documents** (immutable at issue; corrections are revisions) |
| Spec scope | One spec vs. many | **Single coherent spec; staged implementation plan** |

## 2. Architecture Overview

Three app surfaces over a shared data layer:

- **admin** (`apps/admin`) — order intake, sourcing (RFQ dispatch, quote
  comparison, award splitting), document issuance & payment recording.
- **supplier** (`apps/supplier`) — RFQ inbox and per-line quote submission.
- **web** (`apps/web`) — public, OTP-gated document view + PDF download.

Shared packages:

- `packages/db` — new schema modules `orders.ts`, `documents.ts`; enum
  additions; generated migration + hand-journaled RLS migration `0006`.
- `packages/api` — new repos (`orders`, `rfqs`, `awards`, `documents`,
  `documentAccess`) following the established db-first, `ActionResult<T>`,
  no-throw convention with pure, unit-testable helpers.
- `packages/integrations` — Evolution API WhatsApp client + message templates;
  PDF generation.

All money is **integer LKR cents**; all user-visible text uses `*_en`/`*_si`
pairs with English required and Sinhala nullable, per project conventions.

## 3. Data Model

### 3.1 New enums (`packages/db/src/schema/enums.ts`)

```
order_status:    draft | sourcing | quoted | confirmed | invoiced | paid | fulfilling | completed | cancelled
rfq_status:      sent | viewed | quoted | declined | expired | awarded | closed
award_status:    pending | confirmed | cancelled
document_type:   quotation | invoice | receipt
document_status: draft | sent | viewed | accepted | paid | void
order_source:    whatsapp | phone | web | walk_in
```

### 3.2 `packages/db/src/schema/orders.ts`

**orders**
- `id` uuid pk
- `order_no` text unique — human ref, generated (e.g. `FM-2026-0001`)
- `source` order_source not null default `whatsapp`
- `buyer_user_id` uuid null → users.id (link when the customer is a registered buyer)
- `customer_name` text not null
- `customer_phone` text not null
- `customer_email` text null
- `customer_locale` language not null default `en`
- `delivery_address` text null
- `delivery_district` text null
- `delivery_city` text null
- `needed_by_date` date null
- `notes_internal` text null
- `notes_customer` text null
- `status` order_status not null default `draft`
- `created_by_user_id` uuid not null → users.id (admin)
- `created_at`, `updated_at` timestamptz not null default now()
- index on `status`, on `created_by_user_id`

**order_items**
- `id` uuid pk
- `order_id` uuid not null → orders.id (on delete cascade)
- `category_id` uuid null → categories.id (drives supplier matching)
- `description_en` text not null (e.g. "White Roses")
- `description_si` text null
- `variant` text null (e.g. "white", "red")
- `quantity` integer not null (> 0)
- `unit` text not null default `stem` (stem | bunch | box)
- `notes` text null
- `sort_order` integer not null default 0
- index on `order_id`

**rfqs**
- `id` uuid pk
- `order_id` uuid not null → orders.id (on delete cascade)
- `supplier_shop_id` uuid not null → shops.id
- `status` rfq_status not null default `sent`
- `message` text null (custom note to supplier)
- `quote_notes` text null (supplier's overall note on responding)
- `quote_valid_until` timestamptz null
- `sent_at`, `viewed_at`, `responded_at`, `expires_at` timestamptz null
- `created_at`, `updated_at` timestamptz not null default now()
- unique `(order_id, supplier_shop_id)`
- index on `supplier_shop_id`, on `order_id`

**rfq_quote_lines** — supplier's response, one row per line they can supply
- `id` uuid pk
- `rfq_id` uuid not null → rfqs.id (on delete cascade)
- `order_item_id` uuid not null → order_items.id
- `available_qty` integer not null (>= 0)
- `unit_price` integer not null (cost to us, LKR cents, >= 0)
- `lead_time_days` integer null
- `notes` text null
- index on `rfq_id`, on `order_item_id`

**order_item_awards** — admin allocation, split by quantity
- `id` uuid pk
- `order_item_id` uuid not null → order_items.id (on delete cascade)
- `supplier_shop_id` uuid not null → shops.id
- `rfq_quote_line_id` uuid null → rfq_quote_lines.id (price provenance)
- `awarded_qty` integer not null (> 0)
- `unit_cost` integer not null (snapshot from quote, LKR cents)
- `status` award_status not null default `pending`
- `notes` text null
- `created_at`, `updated_at` timestamptz not null default now()
- index on `order_item_id`, on `supplier_shop_id`
- **Invariant (repo-enforced):** for each order_item, `Σ awarded_qty` across
  non-cancelled awards ≤ `order_item.quantity`.

### 3.3 `packages/db/src/schema/documents.ts`

**documents**
- `id` uuid pk
- `order_id` uuid not null → orders.id
- `type` document_type not null
- `doc_no` text unique not null (`FM-Q-2026-0001`, `FM-INV-…`, `FM-RCP-…`)
- `status` document_status not null default `draft`
- `currency` text not null default `LKR`
- `subtotal` integer not null default 0 (cents)
- `discount` integer not null default 0
- `delivery_fee` integer not null default 0
- `tax_amount` integer not null default 0 (0 for now; column reserved)
- `total` integer not null default 0
- `line_snapshot` jsonb not null — array of
  `{ description_en, description_si, variant, qty, unit, unit_price, line_total }`
- `customer_snapshot` jsonb not null — `{ name, phone, email, address, district, city }`
- `notes` text null
- `valid_until` timestamptz null (quotation validity)
- `public_token` text unique not null (unguessable URL id; generated)
- `issued_at` timestamptz null
- `paid_at` timestamptz null
- `payment_method` text null (manual)
- `payment_ref` text null
- `pdf_path` text null (Supabase Storage path, generated on first download)
- `superseded_by_document_id` uuid null → documents.id (revision chain)
- `created_by_user_id` uuid not null → users.id
- `created_at`, `updated_at` timestamptz not null default now()
- index on `order_id`, unique index on `public_token`, unique index on `doc_no`

**document_otps** — server-only, never client-readable
- `id` uuid pk
- `document_id` uuid not null → documents.id (on delete cascade)
- `phone` text not null
- `code_hash` text not null (hashed 6-digit code)
- `expires_at` timestamptz not null
- `attempts` integer not null default 0
- `max_attempts` integer not null default 5
- `consumed_at` timestamptz null
- `created_at` timestamptz not null default now()
- index on `(document_id, created_at)` for rate-limiting

**Snapshot rationale (A1):** once a document is issued (`issued_at` set,
status ≥ `sent`), `line_snapshot`, `customer_snapshot`, and totals are frozen.
Order edits never mutate an issued document; a correction creates a new document
and sets `superseded_by_document_id` on the old one.

## 4. Modules

### 4.1 Repos (`packages/api/src/repos/`)

Each follows the existing convention: `db` first arg, returns `ActionResult<T>`,
no throws from business logic, pure validation/calculation helpers exported
separately for unit tests.

- **`orders.ts`** — create/update order + items; `order_no` generation
  (per-year sequence); status-transition guard (only legal transitions of
  `order_status`); order detail aggregate (items + rfqs + awards + documents).
- **`rfqs.ts`** — `matchRoseGrowers(db, order)`: distinct growers
  (`shop_type = 'grower'`, active) having an active product whose `category_id`
  matches any order-item category; create RFQs (idempotent on
  `(order_id, supplier_shop_id)`); record supplier quote lines
  (`respondedAt`, `status → quoted`); supplier inbox queries scoped to a shop.
- **`awards.ts`** — create/update/cancel awards; enforce
  `Σ awarded_qty ≤ item.quantity`; cost rollup per order; helper to seed an
  award from a chosen `rfq_quote_line` (copies `unit_cost`).
- **`documents.ts`** — `buildQuotation(order, awards, margin)`: rolls awarded
  costs, applies margin (see §6), snapshots lines at **customer** price;
  `issue(document)` (freeze + token + `doc_no` + `issued_at`);
  `revise(document)`; `markPaid(document, method, ref)`; `issueReceipt(order)`.
- **`documentAccess.ts`** — `requestOtp(db, token, phone)` (rate-limit, generate,
  hash, store, dispatch via integrations), `verifyOtp(db, token, phone, code)`
  (attempt-count, expiry, generic errors, mark consumed → issue signed cookie
  value); `verifyCookie(value)`. HMAC secret from env.

### 4.2 Integrations (`packages/integrations/src/`)

- **`whatsapp/evolution.ts`** — `sendText(to, message): ActionResult<void>`
  posting to Evolution API. Lazy env via a passed-in config or `getEnv()`
  pattern (never module-scope on Workers): `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`. Normalises phone to WhatsApp JID.
- **`whatsapp/messages.ts`** — bilingual builders: `rfqNudge(shop, order, url)`,
  `otpCode(code)`, `documentLink(doc, url)`. Pure functions → unit-testable.
- **`pdf/document-pdf.ts`** — renders a document to a PDF byte array using
  **`pdf-lib`** (pure JS, Cloudflare Workers-compatible). See §7 risk.

## 5. App Surfaces & Data Flow

### 5.1 Routes

**admin** (`apps/admin/src/routes/`)
- `orders.index.tsx` — list, filter by `status`.
- `orders.new.tsx` — intake form: customer + delivery + line items.
- `orders.$orderId.tsx` — detail:
  - *Overview:* customer, delivery, status, timeline.
  - *Sourcing panel:* matched suppliers → send RFQs → quote-comparison matrix
    (rows = line items, cols = suppliers, cells = qty/price/lead-time) → award
    splitter (allocate qty per supplier per line).
  - *Documents panel:* create Quotation/Invoice/Receipt, set margin/discount/
    delivery fee, issue, copy/send WhatsApp link, mark paid, view PDF.

**supplier** (`apps/supplier/src/routes/`)
- `rfqs.index.tsx` — RFQ inbox scoped to the logged-in supplier's shop.
- `rfqs.$rfqId.tsx` — respond form (per-line available qty + unit price + lead
  time, overall note, validity) or decline.

**web** (`apps/web/src/routes/`)
- `$locale/d.$token.tsx` — if no valid doc cookie → OTP challenge (enter phone →
  request code → enter code → verify → cookie); else render document.
- `$locale/d.$token.pdf.tsx` (or server route) — gated PDF download.

### 5.2 Flow

1. Admin creates order (`draft`) and adds items.
2. Admin opens sourcing → `matchRoseGrowers` suggests recipients → admin
   confirms → RFQs created (`sent`) → Evolution WhatsApp nudge to each supplier.
   Order → `sourcing`.
3. Supplier opens RFQ (`viewed`) → submits quote lines (`responded_at`,
   `quoted`).
4. Admin reviews quote matrix → allocates awards per line (split by qty) →
   costs roll up.
5. Admin builds Quotation (margin applied), issues, sends WhatsApp link.
   Order → `quoted`.
6. Customer opens link → WhatsApp OTP → views. On acceptance, admin marks
   accepted. Order → `confirmed`.
7. Admin issues Invoice, sends link. Order → `invoiced`.
8. Customer pays offline → admin mark-paid → issues Receipt.
   Order → `paid` → `fulfilling` → `completed`.

## 6. Pricing (cost → customer price)

- Awarded `unit_cost` values give the **sourcing cost** per line.
- Customer price = cost + **margin**. Margin source, in priority order:
  1. explicit per-line customer price the admin types (override), else
  2. a per-order margin % the admin sets on the documents panel, else
  3. platform default margin (a new constant in `packages/api/src/constants.ts`).
- The shop `commission_rate_bps` is a *supplier commission* concept and is **not**
  the customer margin; keep them distinct. Customer margin is a marketplace
  markup configured on the document.
- All arithmetic in integer cents; display via `formatCents`.

## 7. Cross-Cutting Concerns

### Error handling
- `ActionResult` (`ok`/`err`) throughout; no throws from business logic.
- Evolution send failures are recorded and retryable and **never** corrupt order
  or document state (dispatch is a side effect after the state write commits).
- Issued documents are immutable — edits produce revisions.
- Award over-allocation is blocked by repo validation with a typed error.

### OTP security (B1)
- 6-digit codes, hashed at rest, short expiry (e.g. 10 min), `max_attempts`
  cap, per-document request rate-limit, generic error messages (no phone/code
  enumeration), fail-closed on missing config. On success: an HMAC-signed,
  document-scoped cookie with a few-hour TTL; no `auth.users` row for buyers.

### PDF on Cloudflare Workers — the one implementation risk
- No headless browser on Workers. Plan: public document page is
  **print-optimized** (`@media print`) **and** a true downloadable PDF is
  generated with **`pdf-lib`** (pure JS) at the gated `.pdf` route, cached to
  `pdf_path` in Supabase Storage on first generation.
- **Fallback if pdf-lib layout proves too costly:** ship the print-optimized
  page only (browser "Save as PDF") and defer the binary PDF. This is the sole
  area allowed to descope during implementation; it will be re-confirmed in the
  plan.

### RLS (`packages/db/migrations/0006_orders_rls.sql`)
- `orders`, `order_items`, `awards`, `documents`: admin full access.
- `rfqs`, `rfq_quote_lines`: a supplier may **read** rows for their own shop and
  **write** their own quote lines only.
- `document_otps` and the public document view are **server-only** — the public
  page reads via a token+OTP server path (service role / direct db), not as an
  authenticated RLS user.

### Env additions
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` (WhatsApp send).
- `DOC_ACCESS_SECRET` (HMAC for the document-scoped cookie).
- Documented in each app's `.dev.vars` and deploy config; accessed lazily via
  `getEnv()` inside handlers (never module scope).

## 8. Testing

Vitest, extending the existing `packages/api` + `packages/integrations` suites:
- Margin/price math (cost → customer price, rounding in cents).
- Award qty validation (`Σ awarded_qty ≤ quantity`, over-allocation rejected).
- OTP hash/verify, expiry, attempt cap, rate-limit.
- Document total rollups + snapshot immutability after issue.
- Supplier-match query (grower + active product in category).
- Order status-transition guard (legal vs. illegal transitions).
- WhatsApp message template builders (bilingual output).

## 9. Staged Implementation (for the plan)

The plan will sequence, each stage independently shippable/testable:
1. **Schema + migrations + RLS** (orders, documents, enums, `0006`).
2. **Order intake** (admin `/orders`, repos: orders).
3. **RFQ + supplier quotes** (matching, admin dispatch, Evolution client,
   supplier portal inbox/respond).
4. **Sourcing/award** (quote matrix + award splitter, awards repo).
5. **Documents + OTP + PDF** (documents repo, admin documents panel, public
   OTP-gated view, pdf-lib download).

## 10. Out of Scope (this phase)

- PayHere / online payment (Phase 2 proper).
- Buyer self-service accounts / order history portal.
- Automated supplier payouts / supplier billing.
- Inventory reservation / stock decrement.
- Multi-currency (LKR only).
