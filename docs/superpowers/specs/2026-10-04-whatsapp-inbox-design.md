# WhatsApp Integration — Two-Way Inbox (Admin)

**Date:** 2026-10-04
**Status:** Design — awaiting review
**Author:** chamara + Claude

## Problem & Intent

The admin portal can already *send* WhatsApp (supplier invites call
`sendWhatsappText`), but every Worker currently ships with empty/dummy
`EVOLUTION_*` env, so the supplier-invite screen shows **"Invite created —
WhatsApp not configured, share the link manually."** There is **no receive
path at all** — inbound WhatsApp messages go nowhere.

Goal: integrate the project's existing self-hosted **Evolution API** container
(the same WhatsApp number already used by the operator's other admin panels)
so that:

1. The "WhatsApp not configured" banner disappears — invites and OTP actually
   send from all three apps.
2. Admin gains a **two-way inbox**: inbound messages (text **and photos**) are
   captured, stored, and displayed; staff can reply inline from the admin UI.

### Scope decisions (confirmed with operator)

- **Full two-way inbox** in admin (not capture-only, not send-only).
- **One Evolution instance / one WhatsApp number**, shared by **admin + web +
  supplier** for sending. Only **admin** receives (hosts the webhook + inbox).
- Operator **sets the Cloudflare secrets themselves**; this spec documents
  exactly which secrets each Worker needs and the one-time Evolution webhook
  registration.
- Inbound **photos are stored in Supabase Storage** and rendered inline.
- `whatsapp-media` bucket is **public** (unguessable random keys), matching the
  existing `product-images` bucket. Polling the inbox at **~5s** (Cloudflare
  Workers cannot hold a websocket).

### Out of scope (v1 — deliberate cuts)

- Logging web/supplier OTP sends into the inbox thread (cross-app; they still
  deliver, and any reply still lands in the shared admin inbox).
- Sending media (images) *from* admin — v1 reply composer is text-only.
- Real-time push (websockets). Polling only.
- Full media download for non-image kinds (audio/document) — recorded with a
  marker, bytes not stored in v1.

## Current State (verified)

- `packages/integrations/src/evolution.ts` — complete send client:
  `toWhatsappJid`, `buildWhatsappLink`, `sendWhatsappText`, `EvolutionConfig`,
  `SendResult`. Pure, dependency-free, fetch-based (Workers-native).
- `packages/api/src/env.ts` — already reads `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.
- `apps/admin/src/server/suppliers.ts` → `inviteSupplierFn` already calls
  `sendWhatsappText` when the three env vars are present; sets
  `whatsappSent: false` otherwise (source of the banner).
- `apps/web/src/server/documents.ts` — uses `sendWhatsappText` for OTP.
- **No** webhook / inbound handling anywhere.
- Public HTTP endpoint pattern (for the webhook):
  `createFileRoute(path)({ server: { handlers: { POST: async (ctx) => Response } } })`
  — see `apps/web/src/routes/$locale/d.$token.pdf.ts`.
- Supabase Storage upload pattern (for inbound media):
  service-role client → `supabase.storage.from(bucket).upload(path, bytes,
  { contentType, upsert })` → public URL
  `${SUPABASE_URL}/storage/v1/object/public/<bucket>/<path>` — see
  `apps/admin/src/server/bouquet.ts` and `apps/supplier/src/server/products.ts`.
- Service-role client factory: `createSupabaseAdminClient({ url, serviceRoleKey })`
  from `@flowers/auth` (already used in `suppliers.ts`).
- **Migration drift caveat** (memory): prod `__drizzle_migrations` is drifted;
  `db:migrate` is unreliable. New DDL must be **idempotent** and applied +
  verified manually.

## Architecture

```
                 ┌─────────────────────────────────────────────┐
  WhatsApp user  │              Evolution API container          │
   (supplier) ───┼──▶  instance  ──MESSAGES_UPSERT webhook──┐     │
                 └──────────────────────────────────────────┼─────┘
                                                            ▼
   admin Worker:  POST /api/whatsapp/webhook/<secret>  (public, secret-gated)
                        │  parseInboundMessage()
                        │  media? → Supabase Storage (whatsapp-media)
                        ▼
                  whatsapp_conversations / whatsapp_messages  (Postgres)
                        ▲                         ▲
       reply (POST) ────┘                         └──── inbox (GET, poll 5s)
    sendWhatsappReplyFn → sendWhatsappText        admin /whatsapp UI
```

All three apps call `sendWhatsappText` against the **same instance** for their
own outbound needs (invites, OTP, replies). Only the admin Worker is registered
as the instance's webhook target, so all inbound traffic converges on one inbox.

## Components

### 1. DB schema — `packages/db/src/schema/whatsapp.ts`

Enums (new): `whatsapp_direction` (`inbound` | `outbound`),
`whatsapp_message_kind` (`text` | `image` | `audio` | `document` | `other`),
`whatsapp_message_status` (`received` | `sent` | `delivered` | `read` | `failed`).

**`whatsapp_conversations`**
| column | type | notes |
|---|---|---|
| id | uuid pk | defaultRandom |
| remote_jid | text unique not null | e.g. `9477…@s.whatsapp.net` |
| phone | text not null | digits, derived from jid |
| display_name | text | from `pushName` or matched invite/user |
| linked_user_id | uuid → users.id | nullable |
| linked_shop_id | uuid → shops.id | nullable |
| last_message_at | timestamptz not null default now | inbox ordering |
| last_preview | text | truncated last message for the list |
| unread_count | integer not null default 0 | inbound since last read |
| created_at | timestamptz not null default now | |

Index: `(last_message_at desc)`.

**`whatsapp_messages`**
| column | type | notes |
|---|---|---|
| id | uuid pk | defaultRandom |
| conversation_id | uuid → whatsapp_conversations.id not null | cascade on delete |
| evolution_key_id | text unique | Evolution `key.id`; idempotency guard |
| direction | whatsapp_direction not null | |
| kind | whatsapp_message_kind not null default 'text' | |
| text | text | body or caption |
| media_storage_path | text | bucket-relative key in `whatsapp-media` |
| media_mime | text | |
| status | whatsapp_message_status not null | inbound→`received`, outbound→`sent` |
| remote_timestamp | timestamptz | Evolution `messageTimestamp` |
| created_at | timestamptz not null default now | |

Index: `(conversation_id, created_at)`.

Export from `packages/db/src/schema/index.ts`.

**Migration** — new idempotent SQL file (next number in
`packages/db/migrations/`, e.g. `0018_whatsapp_inbox.sql`):
`DO $$ … CREATE TYPE …` guarded with existence checks; `CREATE TABLE IF NOT
EXISTS`; `CREATE INDEX IF NOT EXISTS`; RLS `ENABLE` + a policy that denies anon
(service-role bypasses RLS, which is how the webhook + admin server fns write).
Document manual apply via `DIRECT_DATABASE_URL` and a verification query
(`select to_regclass('public.whatsapp_messages')`), per the drift caveat. Do
**not** rely on `db:migrate`.

### 2. Evolution integration additions — `packages/integrations/src/evolution.ts`

Keep pure / fetch-only. Add:

- Types for the `messages.upsert` webhook payload (minimal, tolerant of extra
  fields): `EvolutionWebhookEvent`, `EvolutionUpsertMessage`.
- `jidToPhone(jid: string): string` — strip `@s.whatsapp.net`, return digits.
- `parseInboundMessage(event): ParsedInbound | null` — normalizes one upsert
  into `{ remoteJid, phone, fromMe, keyId, pushName, kind, text, mediaBase64?,
  mediaMime?, timestamp }`. Returns `null` for events we ignore. Handles
  `conversation`, `extendedTextMessage`, `imageMessage` (caption + base64 when
  `webhook_base64` is on), and falls back to `kind: 'other'`.
- Unit tests in `evolution.test.ts` for `jidToPhone` and `parseInboundMessage`
  (text, image-with-caption, fromMe, unknown kind).

No network calls added here — media bytes arrive inline as base64 in the webhook
(`webhook_base64: true`), so the webhook route decodes and uploads them.

### 3. Data layer — `packages/api`

New module `packages/api/src/whatsapp.ts` (exported via the api barrel and, if a
server subpath export exists, the server subpath — must stay server-safe since
it imports `@flowers/db`). Functions (all take `db`):

- `recordInboundMessage(db, input)` — upsert conversation by `remote_jid`
  (insert or bump `last_message_at`/`last_preview`/`unread_count`), insert the
  message; **no-op if `evolution_key_id` already exists** (idempotent). On first
  insert, attempt `linkConversationByPhone`.
- `recordOutboundMessage(db, input)` — upsert conversation, insert outbound row
  (does **not** bump unread), update preview/time.
- `linkConversationByPhone(db, phone)` — match `supplier_invites.phone` then
  `users.phone`; set `display_name` / `linked_user_id` / `linked_shop_id` when
  found. Best-effort.
- `listConversations(db)` — ordered by `last_message_at desc`.
- `getConversationMessages(db, conversationId)` — ordered `created_at asc`.
- `markConversationRead(db, conversationId)` — `unread_count = 0`.

Unit-testable with the existing api test setup where practical.

### 4. Receive — `apps/admin/src/routes/api.whatsapp.webhook.$secret.ts`

- `server.handlers.POST` returning a `Response`.
- **Guard:** constant-time compare `params.secret` against
  `env.WHATSAPP_WEBHOOK_SECRET`; on mismatch or missing env → `404` (no body
  that confirms the endpoint exists).
- Parse JSON body → `parseInboundMessage`. Ignore `fromMe` messages and nulls
  (return `200` so Evolution stops retrying).
- If `mediaBase64`: decode → `createSupabaseAdminClient` → upload to
  `whatsapp-media` at `inbound/<yyyy>/<random>.<ext>` →
  `media_storage_path`. Upload failure is best-effort (store the row without a
  path, `kind` preserved).
- `recordInboundMessage(...)`. Always return `200` on handled/ignored;
  `500` only on unexpected throw (lets Evolution retry transient failures —
  idempotency makes retries safe).
- Must **not** export a React component (server-only route file → keeps
  `@flowers/db` / supabase client out of the client bundle).

### 5. Send / reply — `apps/admin/src/server/whatsapp.ts`

- `listWhatsappConversationsFn` (GET, admin-gated) → `listConversations`.
- `getWhatsappThreadFn` (GET, admin-gated, input `{ conversationId }`) →
  `getConversationMessages` + `markConversationRead`.
- `sendWhatsappReplyFn` (POST, admin-gated, input `{ conversationId, text }`) →
  look up conversation phone → `sendWhatsappText` → on success
  `recordOutboundMessage`. Returns `ActionResult`.
- Reuse the `requireAdmin()` guard pattern from `suppliers.ts`.

Also: amend `inviteSupplierFn` in `suppliers.ts` so a **successful** invite send
calls `recordOutboundMessage` (invite text → thread). Guard so a logging failure
never fails the invite.

### 6. Inbox UI — `apps/admin/src/routes/whatsapp.tsx`

- Two-pane layout. **Left:** conversation list — `display_name || phone`, last
  preview, relative time, unread badge. **Right:** selected thread — bubbles
  (inbound left, outbound right), inline `<img>` for image messages via the
  public bucket URL, caption/text below. **Composer:** text input + Send
  (calls `sendWhatsappReplyFn`, optimistic append, invalidate thread query).
- Data via TanStack Query with `refetchInterval: 5000` on both the conversation
  list and the open thread. Selecting a conversation marks it read.
- Mobile: single-pane with back navigation (match existing admin responsive
  patterns).
- Add a **"WhatsApp"** link to the admin sidebar (`__root.tsx`), between
  Suppliers and Flowers.

### 7. Config & ops (operator-run; documented in the plan)

**Secrets (per Worker, via `wrangler secret put` with `CLOUDFLARE_ACCOUNT_ID`
set — see memory):**

| secret | web | supplier | admin |
|---|:--:|:--:|:--:|
| `EVOLUTION_API_URL` | ✓ | ✓ | ✓ |
| `EVOLUTION_API_KEY` | ✓ | ✓ | ✓ |
| `EVOLUTION_INSTANCE` | ✓ | ✓ | ✓ |
| `WHATSAPP_WEBHOOK_SECRET` | | | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | | | ✓ (if not already set) |

Add `WHATSAPP_WEBHOOK_SECRET` to `packages/api/src/env.ts` (`AppEnv` +
`read(...)`). Mirror all into each app's `.dev.vars` for local dev.

**Storage:** create a **public** bucket `whatsapp-media`.

**One-time Evolution webhook registration** (operator runs, documented):
```
POST {EVOLUTION_API_URL}/webhook/set/{EVOLUTION_INSTANCE}
apikey: {EVOLUTION_API_KEY}
{
  "webhook": {
    "enabled": true,
    "url": "https://admin.flowermarket.lk/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>",
    "webhookByEvents": false,
    "base64": true,
    "events": ["MESSAGES_UPSERT"]
  }
}
```
(Exact JSON shape verified against the operator's Evolution version during
implementation — field names differ slightly between Evolution v1 and v2.)

## Error handling

- Webhook: unknown/`fromMe`/unparseable → `200` ignore; secret mismatch →
  `404`; unexpected throw → `500` (safe to retry; idempotent).
- Send: `sendWhatsappText` already returns `SendResult`; reply surfaces a
  user-visible error toast on `{ ok:false }` and does **not** log an outbound
  row.
- Media upload failure → store the message row without media (degrade, never
  drop the message).
- All three `EVOLUTION_*` missing → send paths behave exactly as today
  (`whatsappSent:false`), so nothing regresses pre-config.

## Testing

- **Unit:** `evolution.test.ts` — `jidToPhone`, `parseInboundMessage` (text,
  extendedText, image+caption+base64, fromMe, unknown). Data-layer idempotency
  (`recordInboundMessage` twice with same `evolution_key_id` → one row,
  conversation bumped once).
- **Manual/integration:** after config, send a WhatsApp to the number → appears
  in `/whatsapp`; reply from admin → arrives on the phone; send a photo →
  thumbnail renders; invite a supplier → send succeeds (banner shows "sent") and
  the invite appears in the thread.
- `pnpm build` then `pnpm typecheck` (build-before-typecheck rule); `pnpm test`.

## Security notes

- Webhook authenticated by a high-entropy path secret, constant-time compared;
  admin Worker is the only registered target.
- `whatsapp-media` public but keyed with random unguessable paths (same posture
  as `product-images`). Accepted trade-off for v1; a private bucket + signed
  URLs is a possible follow-up if message media is deemed sensitive.
- New tables RLS-enabled, anon denied; all writes via service-role server code.
- No raw SQL outside the migration; no `any`; lazy `getEnv()`/`createDb()`
  inside handlers (Workers rule).

## Rollout order

1. Schema + idempotent migration (apply + verify manually).
2. Integration parse helpers + tests.
3. Data layer + tests.
4. `env.ts` add `WHATSAPP_WEBHOOK_SECRET`.
5. Webhook route.
6. Admin server fns + invite-send logging.
7. Admin inbox UI + sidebar link.
8. Operator config (secrets, bucket, webhook registration) + manual verify.
