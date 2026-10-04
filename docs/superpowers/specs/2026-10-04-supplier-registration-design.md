# Supplier Registration & Onboarding — Design

**Date:** 2026-10-04
**Status:** Approved design (pre-implementation)
**Approach:** A — two front doors, one shared spine; **assisted-first sequencing**

## Purpose

Let real-world flower suppliers come onto FlowerMarket.lk and start selling.
Today the supplier portal has **sign-in only** (no sign-up), a single shared
shop-creation form, and an unused `verification_status`. This design closes
those gaps for three real personas while keeping the farmer path realistic for
low-tech, Sinhala-first users.

## Personas → account model

The platform exposes **two public supplier types**, mapped onto the existing
`shop_type` enum:

- **Florist** (`shop_type = florist`) — retail. Physical shop *or* online-store;
  both are the same account. The storefront (shop page + product showcase) is a
  built-in feature, to be gated later by a subscription **plan seam**.
- **Grower / aggregator** (`shop_type = grower`) — wholesale. Covers both the
  solo farmer and the **middleman**, as independent accounts:
  - **Farmers are first-class accounts** — they register individually as their
    own grower shops. Strategically the suppliers we most want.
  - **Middlemen also register** as grower accounts with `is_aggregator = true`.
    A middleman may source from farmers who have *also* registered directly —
    **that overlap is acceptable**; the platform does not model or deduplicate
    the farmer↔middleman relationship. No farmer sub-profiles, no agent-linking.
  - `is_aggregator` distinguishes solo farmer from aggregator for
    trust/filtering.

**Strategic direction:** the platform aims to *become* the middleman over time
(aggregate farmers directly, disintermediating middlemen). So direct farmer
onboarding is the priority; middlemen are a parallel / transitional supply
source. This informs sequencing and positioning, not the near-term schema.

Decisions locked during brainstorming:
- Middleman model: **farmers and middlemen are independent accounts; overlap
  tolerated; no farmer↔middleman modeling.**
- Signup channels: **WhatsApp-assisted + admin/field-agent + email/Google
  self-serve.** (Phone-OTP *self-serve* was explicitly not chosen; phone-OTP is
  used only for handover login — see §6.)
- Post-registration: **handover** — the farmer self-manages after setup.
- Verification: **light + manual review, tiered**; staff vouching counts.
- Online-store florist: **same florist type**; storefront is a feature + a
  nullable `plan` seam. **YAGNI on billing.**

## Architecture: two front doors, one shared spine

One shop record plus its verification state is the single source of truth. Both
registration paths write to the same record and feed the same admin review
queue. Role flips `buyer → supplier` the moment a shop is created, by either
door.

```
                WhatsApp (94778540633) / field agent
                              │  (intake funnel, manual)
  self-serve                  ▼
  florist ──► /register ─┐   Admin "Create supplier" tool
                         │           │
                         ▼           ▼
                   createShop()  admin provisions auth user + shop
                         │           │
                         └──────┬────┘
                                ▼
                      shops row  +  users.role = supplier
                                │
                                ▼
                   verification review queue (admin)
                        unverified/pending → verified/rejected
```

## 1. Data model changes (`packages/db`)

`shops` table additions (schema is source of truth; generate a migration):

- `isAggregator boolean not null default false` — middleman flag.
- `plan text not null default 'free'` — subscription seam; no billing now.
- `verificationNotes text` — admin review notes.
- `verificationProof jsonb` — `{ phoneVerified, idPhotoPath, businessRegNo?, ... }`.
- `verificationSubmittedAt timestamptz`
- `verificationReviewedAt timestamptz`
- `verificationReviewedBy uuid references users(id)`

Verification state stays **inline on `shops`** — no `shop_verifications` history
table (the light model keeps it light). `verificationStatus` enum
(`unverified|pending|verified|rejected`) already exists and is unchanged.

**One new table — `supplier_invites`** (outbound acquisition; see §3B):

- `id uuid pk`
- `phone text not null` — WhatsApp number invited.
- `nameEn text`, `shopType shop_type`, `isAggregator boolean` — pre-fill hints.
- `language language not null default 'en'` — message language (EN/SI).
- `token text unique not null` — opaque join token for the landing link.
- `status text not null default 'sent'` — `sent | accepted | expired`.
- `sentBy uuid references users(id)` — admin who sent it.
- `acceptedShopId uuid references shops(id)` — set when the invite is accepted.
- `sentAt timestamptz default now()`, `expiresAt timestamptz`, `acceptedAt timestamptz`.

Unique partial constraint / app-layer check prevents two active (`sent`) invites
to the same `phone`.

RLS: new columns inherit existing `shops` policies; the admin review writes go
through the service-role / admin path. Re-check `0001_rls_policies.sql` so the
admin tool can update verification fields.

## 2. Shared spine

- `createShop` (in `packages/api`) must, in one transaction: insert the shop
  **and** set the owner's `users.role = 'supplier'` (today it does not — session
  resolution is shop-based, so a shop owner can still have role `buyer`).
- Add `canSellCheck(shop)` helper in `packages/api` — returns whether a shop may
  list/sell (`verificationStatus === 'verified'` and, in future, `plan`
  allows). This is the single choke point future plan-gating edits.

## 3. Assisted door — Phase 1 (admin, built first)

New admin routes under `apps/admin/src/routes`:

- `suppliers.new.tsx` — "Create supplier" form: name EN/SI, type
  (florist/grower), `is_aggregator`, district/city, owner phone + optional
  email, and a staff-vouched toggle (`set verified | pending`).
- Server fn uses `createSupabaseAdminClient` (service role, already available in
  `@flowers/auth`) to provision the auth user (phone and/or email), insert the
  `users` row with role `supplier`, and the `shop` row pre-filled. Idempotent on
  an existing phone/email (reuse rather than duplicate).

WhatsApp is the **intake funnel only** in Phase 1 — staff transcribe the intake
into this form. No WhatsApp bot (out of scope, see §10).

## 3B. Outbound WhatsApp invitation — Phase 2 (admin → supplier)

Admin finds a supplier's WhatsApp number (farmer, middleman, or florist) and
sends an invitation that explains the benefits and links them into self-serve
registration. Ships with the self-serve door (§5) because it depends on a
landing page to register on.

**Admin side:**
- An "Invite via WhatsApp" action (on `suppliers.index.tsx` or a small
  `suppliers.invite.tsx`): enter name, WhatsApp number, type (florist/grower),
  `is_aggregator`, and language (EN/SI).
- Server fn: create a `supplier_invites` row with a unique `token` and
  `expiresAt`; render a **type-aware, bilingual benefits message** containing the
  join link; send it via the existing **Evolution WhatsApp** integration; mark
  `status = 'sent'`. Refuse/short-circuit if an active invite already exists for
  the number (dedupe).
- Benefits copy differs by type (templates live in code, EN + SI):
  - **Farmer:** reach buyers directly, better prices, free listing, less
    dependence on middlemen.
  - **Middleman/aggregator:** reach more buyers, handle bulk RFQs in one place.
  - **Florist:** your own online storefront, more orders online.

**Supplier side:**
- Join link `/join/$token` (or `/register?invite=$token`): validate the token
  (exists, not expired, not accepted), **pre-fill** type/name from the invite,
  then run the normal self-serve signup (§5). On shop creation, mark the invite
  `accepted`, set `acceptedShopId`/`acceptedAt`. Expired/used tokens fall back to
  plain `/register`.
- Attribution: the accepted shop is traceable to the invite and the admin who
  sent it.

## 4. Verification review queue — Phase 1 (admin)

- `suppliers.index.tsx` — list shops filterable by `verificationStatus`; detail
  view shows submitted proof and flips `pending → verified / rejected` with
  notes, writing `verificationReviewedBy/At`.

## 5. Self-serve door — Phase 2 (supplier portal)

- Add `apps/supplier/src/routes/register.tsx` — the missing sign-up:
  email/password + Google → Supabase `signUp` → existing `/onboarding` form →
  shop `unverified` → a lightweight "submit for verification" step (upload
  photo/ID, confirm phone) that sets status `pending`.
- Cross-link `/login ⇄ /register`.
- Accepts an optional `invite` token (§3B): pre-fills type/name and marks the
  `supplier_invites` row `accepted` on success.

## 6. Handover login — Phase 3

- Enable Supabase phone-OTP so email-less farmers can re-login after handover;
  deliver the OTP over WhatsApp via the existing Evolution integration if
  straightforward, else fall back to SMS. Phase 3 because Phase-1 accounts are
  staff-managed until handover.

## 7. Plan / subscription seam

The entire present footprint is the `plan` column (default `free`) and the
`canSellCheck`/feature-gate helper. No PayHere subscriptions, no tier
definitions, no UI. Monetization is a separate future project.

## 8. Sequencing

- **Phase 1 (first):** schema migration + role flip + admin create-supplier tool
  + verification queue. → Real farmers can be onboarded via WhatsApp/field agent
  immediately.
- **Phase 2:** florist self-serve sign-up + self-submitted verification, **plus
  the outbound WhatsApp invite** (admin send + tokenized `/join` landing +
  `supplier_invites` tracking) — the two halves ship together.
- **Phase 3:** phone-OTP / WhatsApp handover login.

## 9. Testing

- `packages/api` vitest: `createShop` flips role + sets `shop_type` /
  `is_aggregator`; verification state transitions; `canSellCheck`.
- Admin provisioning server fn tested against the dev / `AUTH_DISABLED` path
  where the DB is bypassed, matching existing server-fn patterns.
- Invite flow: token generation/validation, expiry, duplicate-active-invite
  guard, `sent → accepted` transition on registration, and type/language-aware
  message template rendering.

## 10. Out of scope / YAGNI (seams left where cheap)

- WhatsApp onboarding **bot** / conversational intake. Outbound invites are
  in scope (§3B), but *inbound* WhatsApp intake stays manual (staff transcribe
  into the admin create-supplier tool).
- Actual billing / subscriptions (seam: `plan` column).
- Farmer sub-profiles / agent-linking under a middleman (farmers register as
  their own independent accounts; farmer↔middleman overlap is tolerated, not modeled).
- Platform-as-middleman aggregation (strategic future direction, not this build).
- Separate verification-history table (inline state is enough for the light model).
- Bulk CSV farmer import.

## Relevant existing code

- `apps/supplier/src/routes/login.tsx`, `onboarding.tsx`, `__root.tsx` (gating).
- `apps/supplier/src/server/auth.ts`, `session.ts`, `shops.ts`.
- `packages/api` — `createShop`, `getUserRole`, `getShopByOwner`.
- `packages/auth` — `createSupabaseAdminClient`.
- `packages/db/src/schema/shops.ts`, `enums.ts`, `users.ts`.
- `apps/admin/src/routes/*` (new `suppliers.*` + invite routes land here).
- Existing **Evolution WhatsApp** send path (order-fulfilment subsystem,
  `EVOLUTION_*` Cloudflare secrets) — reused for outbound invites (§3B).
