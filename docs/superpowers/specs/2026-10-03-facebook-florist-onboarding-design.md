# Facebook Florist Onboarding — Design Spec

**Date:** 2026-10-03  
**Status:** Approved — ready for implementation planning

---

## Overview

Admin discovers Facebook-only floral businesses and creates light profiles for them directly in the admin portal. Each profile goes live on the public marketplace immediately. Admin sends the florist a WhatsApp invitation to "claim" their listing. On claim, the florist registers a full supplier account and the shop is linked to them. The existing RFQ / order-fulfilment flow handles customer quote requests; admin mediates unclaimed shops via WhatsApp until they register.

This follows the privatedrivertour.lk aggregator model: maximum marketplace density from day one, self-service onboarding via invitation.

---

## 1. Schema

### 1.1 New enum

```sql
CREATE TYPE claim_status AS ENUM ('unclaimed', 'invited', 'claimed');
```

### 1.2 `shops` table alterations

| Change | Detail |
|---|---|
| `owner_user_id` | Make nullable (`DROP NOT NULL`). All server functions and RLS policies guard `owner_user_id IS NOT NULL` before supplier-scoped access. |
| Add `claim_status` | `claim_status NOT NULL DEFAULT 'unclaimed'` |
| Add `fb_page_url` | `text` nullable |
| Add `fb_page_name` | `text` nullable |

### 1.3 New table: `shop_invitations`

```sql
CREATE TABLE shop_invitations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  token          text        NOT NULL UNIQUE,          -- 32-byte hex, URL-safe
  invited_by     uuid        NOT NULL REFERENCES users(id),
  whatsapp_number text       NOT NULL,
  email          text,                                 -- optional
  sent_at        timestamptz,                          -- set when admin dispatches
  claimed_at     timestamptz,                          -- set on successful registration
  expires_at     timestamptz NOT NULL,                 -- created_at + 30 days
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

### 1.4 RLS changes

**`shops`:**
- Public SELECT: allow all rows regardless of `claim_status` (all shops are listed).
- Supplier SELECT / UPDATE: existing policy gains guard `owner_user_id IS NOT NULL AND owner_user_id = auth.uid()`.

**`shop_invitations`:**
- Admin role: full CRUD.
- Anonymous / public: SELECT by exact `token` match only (for the claim page to read shop details without auth).

### 1.5 Migration strategy

Following the established project convention (see order-fulfilment SDD Ruling P4):
- `drizzle-kit generate` produces the ALTER + new table SQL (`0008_*.sql`).
- Hand-add `0009_florist_onboarding_rls.sql` for updated RLS policies.
- Journal both in `packages/db/migrations/meta/_journal.json`.
- Do **not** run `pnpm db:migrate` during the SDD run; applied by the developer at finishing-a-development-branch.

---

## 2. Admin Portal

### 2.1 New page — Add Facebook Florist

Route: `apps/admin/src/routes/shops.new-facebook.tsx`

Form fields:

| Field | Notes |
|---|---|
| Shop name EN | Required |
| Shop name SI | Nullable |
| Shop type | `florist` / `grower` |
| District | Existing enum |
| City | Text |
| WhatsApp number | Stored on invitation record |
| Facebook page URL | Stored as `fb_page_url` |
| Facebook page name | Stored as `fb_page_name` |
| Categories | Multi-select from active categories |

On submit → calls `createFacebookShop()` server function → success screen shows:
- The invitation link (copy button).
- **"Send via WhatsApp"** button — `wa.me/{number}?text=...` deep link with a pre-written bilingual message: *"Hi, we've created a listing for [Shop Name] on FlowerMarket.lk — claim it here: [link]"* (English + Sinhala).

No backend WhatsApp dispatch for the initial send — the `wa.me` deep link opens the admin's own WhatsApp. `sent_at` is set optimistically when admin clicks the button (client-side call to `markInvitationSent`).

### 2.2 Shops list — `shops.index.tsx`

- Add `claim_status` badge column: `unclaimed` (grey) / `invited` (yellow) / `claimed` (green).
- Add **"Add Facebook Florist"** button → `shops.new-facebook.tsx`.

### 2.3 Shop detail — Invitation panel

Added to existing `shops.$shopId.tsx`:
- Shows invitation history (list of tokens, `sent_at`, `claimed_at`, `expires_at`).
- **"Resend invitation"** — calls `resendInvitation()`: invalidates all open tokens, creates a fresh one, re-opens the WhatsApp deep link.
- **"Copy link"** — copies current active invitation URL to clipboard.

---

## 3. Supplier Portal — Claim Flow

### 3.1 New route

`apps/supplier/src/routes/claim.$token.tsx` — no auth required to view.

**Page states:**

| State | UI |
|---|---|
| Valid, unclaimed | Shop profile preview (read-only) + registration form |
| Already claimed | "This listing has already been claimed. Sign in." |
| Expired / invalid | "This link is no longer valid. Contact us on WhatsApp." |

### 3.2 Registration form

Pre-filled where possible from the shop record:

- Full name (free text)
- Email
- Password + confirm
- Phone number
- Shop name shown read-only (editable post-claim from supplier dashboard)

### 3.3 `claimShop` server function

Atomic sequence:

1. Validate token — not expired, `claimed_at IS NULL`. Return 400 if invalid.
2. `supabase.auth.admin.createUser({ email, password, user_metadata: { full_name, phone } })` → new `auth.users` id. The `handle_new_user` trigger fires immediately and inserts a `public.users` row with `role = 'buyer'`.
3. `UPDATE public.users SET role = 'supplier', full_name = ..., phone = ... WHERE id = newUserId` — corrects the role set by the trigger.
4. `UPDATE shops SET owner_user_id = newUserId, claim_status = 'claimed' WHERE id = shop.id AND claim_status != 'claimed'`.
5. `UPDATE shop_invitations SET claimed_at = now() WHERE token = token`.
6. Sign user in via `supabase.auth.signInWithPassword({ email, password })` → redirect to supplier dashboard `/`.

**Error cases:**
- Email already registered: surface a clear message ("An account with this email already exists — sign in to link your listing"). Full link-existing-account flow deferred to a follow-up.
- Concurrent claim race: the `UPDATE shops` in step 4 is guarded by a `WHERE claim_status != 'claimed'` predicate; the transaction that loses gets a 0-row update and returns a conflict error.

---

## 4. Web App — Public Listing

### 4.1 Shop listing — `shops.index.tsx`

No structural changes. Unclaimed shops appear in search results identically to claimed ones. The DB query reads all shops; `owner_user_id IS NULL` is transparent to the listing.

### 4.2 Shop profile — `shops.$slug.tsx`

One conditional UI element for unclaimed shops — a soft banner below the shop header:

> *"This florist hasn't joined FlowerMarket.lk yet. You can still request a quote — we'll reach out to them on your behalf."*

CTA → existing WhatsApp enquiry flow (`lib/enquiry.tsx`). No new route or server function. Admin mediates the quote manually for unclaimed shops.

Banner is suppressed once `claim_status = 'claimed'`.

**SEO:** Unclaimed shops receive identical JSON-LD / meta treatment as claimed ones. Slug is set by admin at creation and is stable across the claim lifecycle — no redirects needed.

---

## 5. API & Server Functions

### 5.1 New repo — `packages/api/src/repos/shopInvitations.ts`

| Function | Signature | Purpose |
|---|---|---|
| `createInvitation` | `(db, { shopId, adminUserId, whatsappNumber, email? })` | Insert invitation; generate 32-byte hex token; `expires_at = now() + 30 days` |
| `getInvitationByToken` | `(db, token)` | Return invitation + joined shop; null if not found |
| `markInvitationSent` | `(db, token)` | Set `sent_at = now()` |
| `markInvitationClaimed` | `(db, token)` | Set `claimed_at = now()` |
| `invalidatePriorInvitations` | `(db, shopId)` | Set `expires_at = now()` on all open invitations for a shop |
| `listInvitationsByShop` | `(db, shopId)` | Full invitation history for admin view |

Exported from `packages/api/src/index.ts` barrel (following Ruling P2 from order-fulfilment SDD).

### 5.2 Admin server functions — `apps/admin/src/server/shopInvitations.ts`

| Function | Returns |
|---|---|
| `createFacebookShop(input)` | Creates shop + calls `createInvitation`; returns `{ shop, invitationToken }` |
| `resendInvitation(shopId)` | Invalidates open tokens; creates fresh one; returns new token |
| `markInvitationSent(token)` | Thin wrapper — called client-side after WhatsApp deep link opens |

### 5.3 Supplier server functions — `apps/supplier/src/server/claim.ts`

| Function | Returns |
|---|---|
| `getClaimPreview(token)` | Validates token; returns shop details for pre-fill; null/error if invalid |
| `claimShop(token, { fullName, email, password, phone })` | Atomic registration transaction (steps 1–5 in §3.3) |

### 5.4 Barrel export

`shopInvitations` repo added to `packages/api/src/index.ts`. No new subpath export needed (server-only repo, no client bundle concern).

---

## 6. Out of Scope (this spec)

- Linking an existing supplier account to an unclaimed listing (email-already-exists path).
- Evolution API / automated WhatsApp dispatch for invitations (the `wa.me` deep link is sufficient for v1).
- Admin editing a Facebook florist's profile post-creation (use existing shop edit flow once claimed).
- Product pre-population from Facebook page content.

---

## 7. Rulings

**R1 — Nullable FK guard:** Every server function and RLS policy that previously assumed `owner_user_id IS NOT NULL` must be audited. Supplier-scoped reads/writes add an explicit `IS NOT NULL` guard. Public reads are unaffected.

**R2 — Token generation:** Use `crypto.getRandomValues` (Web Crypto API, available in Cloudflare Workers) to generate 32 bytes, hex-encoded. Do not use `Math.random()`.

**R3 — No client-bundle imports:** `shopInvitations` repo imports only from `@flowers/api` barrel and Drizzle — never from `@flowers/db` directly. Follows Ruling P2 of the order-fulfilment SDD.

**R4 — Claim atomicity:** Steps 3–5 of `claimShop` run inside a Drizzle transaction. Supabase Auth `createUser` (step 2) is called before the transaction opens (Auth is outside Postgres tx scope); on transaction failure, the orphaned auth user is cleaned up via `supabase.auth.admin.deleteUser`.

**R5 — `handle_new_user` trigger:** The existing trigger on `auth.users` auto-inserts a `public.users` row with `role = 'buyer'` on every signup. `claimShop` must NOT also INSERT into `public.users` (PK conflict). Instead, step 3 UPDATEs the trigger-created row to `role = 'supplier'` and fills in `full_name` / `phone`.
