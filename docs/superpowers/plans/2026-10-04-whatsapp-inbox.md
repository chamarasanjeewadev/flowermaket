# WhatsApp Two-Way Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the admin portal to the project's existing Evolution API WhatsApp container so invites/OTP actually send, and add a two-way inbox (receive text + photos, reply inline).

**Architecture:** All three apps send via one shared Evolution instance using the existing `sendWhatsappText`. Only the admin Worker is registered as that instance's webhook target: a secret-gated public POST route parses inbound `messages.upsert` events, stores media in Supabase Storage, and writes to two new Postgres tables. An admin inbox route reads those tables (polling every 5s) and replies through `sendWhatsappText`.

**Tech Stack:** TanStack Start (React 19), Drizzle ORM, Supabase (Postgres + Storage), Cloudflare Workers, Evolution API (self-hosted WhatsApp), vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-whatsapp-inbox-design.md`

## Global Constraints

- **No `any`, no untyped SQL.** Drizzle for all DB access; raw SQL only inside the migration file.
- **Lazy env on Workers.** Call `getEnv()` / `tryCreateDb()` / `createDb()` **inside** handlers, never at module top level.
- **No DB barrel in client code.** Route/server files that touch `@flowers/db` or the supabase client must be server-only (no exported React component in the same file; webhook route exports only `server.handlers`). Import PDF/db-heavy things from subpaths, not the `@flowers/api` barrel, in client-reachable files.
- **Build before typecheck.** On a fresh state run `pnpm build` before `pnpm typecheck` (generates `routeTree.gen.ts`).
- **Postgres client config** stays `{ max: 1, prepare: false }` (owned by `createDb()` — do not change).
- **Migration drift:** prod `__drizzle_migrations` is drifted; `db:migrate` is unreliable. New DDL must be idempotent and applied + verified manually against `DIRECT_DATABASE_URL`.
- **Money/bilingual rules** do not apply here (no money columns; admin UI is English-only, matching the existing admin portal).
- **DB-touching functions are not unit-tested in this repo** (see `repos/invites.ts` `createInvite` — no test). TDD the pure helpers; verify DB/route/UI behavior with the manual steps in Task 7.

## Review Focus

- **Webhook idempotency** — Evolution retries deliver the same `key.id`; a retry must not insert a duplicate message or double-increment `unread_count`. Pinned: pure parse is covered in Task 2; DB-level idempotency is manually verified in Task 7 (send twice, expect one row).
- **`fromMe` echo** — Evolution emits `messages.upsert` for messages the instance itself sent; these must be ignored on receive so replies don't appear as inbound. Pinned: Task 2 test (`parseInboundMessage` returns `null` when `key.fromMe`).
- **Image with caption + base64** — a grower's photo must yield `kind:'image'`, the caption as `text`, and decodable base64 + mime. Pinned: Task 2 test.
- **Webhook secret mismatch** — a wrong/absent secret must 404 without confirming the endpoint, via constant-time compare. Pinned: Task 4 test (`timingSafeEqualStr`).
- **Degenerate phone/jid + long previews** — odd JIDs (`+94 77…`, group jids) and very long/media-only messages must not crash the list; `jidToPhone` and `buildPreview` handle them. Pinned: Task 2 (`jidToPhone`) and Task 3 (`buildPreview`) tests.

---

### Task 1: Schema + idempotent migration

**Files:**
- Modify: `packages/db/src/schema/enums.ts` (append 3 enums)
- Create: `packages/db/src/schema/whatsapp.ts`
- Modify: `packages/db/src/schema/index.ts` (add `export * from "./whatsapp";`)
- Create: `packages/db/migrations/0018_whatsapp_inbox.sql`

**Interfaces:**
- Produces: Drizzle tables `whatsappConversations`, `whatsappMessages` (reachable via `schema.whatsappConversations` / `schema.whatsappMessages` from `@flowers/db/client`); enums `whatsappDirection`, `whatsappMessageKind`, `whatsappMessageStatus`.

- [ ] **Step 1: Append enums** to `packages/db/src/schema/enums.ts`:

```ts
export const whatsappDirection = pgEnum("whatsapp_direction", ["inbound", "outbound"]);

export const whatsappMessageKind = pgEnum("whatsapp_message_kind", [
  "text", "image", "audio", "document", "other",
]);

export const whatsappMessageStatus = pgEnum("whatsapp_message_status", [
  "received", "sent", "delivered", "read", "failed",
]);
```

- [ ] **Step 2: Create** `packages/db/src/schema/whatsapp.ts`:

```ts
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  whatsappDirection,
  whatsappMessageKind,
  whatsappMessageStatus,
} from "./enums";
import { users } from "./users";
import { shops } from "./shops";

/**
 * One conversation per remote WhatsApp JID. Inbound traffic for the shared
 * number converges here (admin is the only webhook target).
 */
export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    remoteJid: text("remote_jid").unique().notNull(),
    phone: text("phone").notNull(),
    displayName: text("display_name"),
    linkedUserId: uuid("linked_user_id").references(() => users.id),
    linkedShopId: uuid("linked_shop_id").references(() => shops.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPreview: text("last_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("whatsapp_conversations_last_message_idx").on(t.lastMessageAt)],
);

/** Individual messages (inbound + outbound), newest appended. */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    evolutionKeyId: text("evolution_key_id").unique(),
    direction: whatsappDirection("direction").notNull(),
    kind: whatsappMessageKind("kind").notNull().default("text"),
    text: text("text"),
    mediaStoragePath: text("media_storage_path"),
    mediaMime: text("media_mime"),
    status: whatsappMessageStatus("status").notNull(),
    remoteTimestamp: timestamp("remote_timestamp", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whatsapp_messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
);
```

- [ ] **Step 3: Export** — add to `packages/db/src/schema/index.ts`:

```ts
export * from "./whatsapp";
```

- [ ] **Step 4: Create idempotent migration** `packages/db/migrations/0018_whatsapp_inbox.sql`:

```sql
-- WhatsApp inbox: conversations + messages. Idempotent (prod journal is drifted).
DO $$ BEGIN
  CREATE TYPE "whatsapp_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_kind" AS ENUM ('text', 'image', 'audio', 'document', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_status" AS ENUM ('received', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "remote_jid" text NOT NULL,
  "phone" text NOT NULL,
  "display_name" text,
  "linked_user_id" uuid REFERENCES "users"("id"),
  "linked_shop_id" uuid REFERENCES "shops"("id"),
  "last_message_at" timestamptz DEFAULT now() NOT NULL,
  "last_preview" text,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_conversations_remote_jid_unique" UNIQUE ("remote_jid")
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
  "evolution_key_id" text,
  "direction" "whatsapp_direction" NOT NULL,
  "kind" "whatsapp_message_kind" DEFAULT 'text' NOT NULL,
  "text" text,
  "media_storage_path" text,
  "media_mime" text,
  "status" "whatsapp_message_status" NOT NULL,
  "remote_timestamp" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_messages_evolution_key_id_unique" UNIQUE ("evolution_key_id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_idx" ON "whatsapp_conversations" ("last_message_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_idx" ON "whatsapp_messages" ("conversation_id", "created_at");

-- RLS: deny anon; service-role (webhook + admin server fns) bypasses RLS.
ALTER TABLE "whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Typecheck the schema** (no DB needed):

Run: `pnpm --filter @flowers/db build && pnpm --filter @flowers/db typecheck`
Expected: PASS (schema compiles; new tables/enums resolve).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/enums.ts packages/db/src/schema/whatsapp.ts packages/db/src/schema/index.ts packages/db/migrations/0018_whatsapp_inbox.sql
git commit -m "feat(db): whatsapp_conversations + whatsapp_messages tables"
```

---

### Task 2: Evolution inbound parse helpers

**Files:**
- Modify: `packages/integrations/src/evolution.ts` (append types + `jidToPhone` + `parseInboundMessage`)
- Modify: `packages/integrations/src/evolution.test.ts` (append tests)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `jidToPhone(jid: string): string`
  - `interface ParsedInbound { remoteJid: string; phone: string; keyId: string | null; pushName: string | null; kind: "text" | "image" | "audio" | "document" | "other"; text: string | null; mediaBase64: string | null; mediaMime: string | null; timestamp: number | null; }`
  - `parseInboundMessage(event: unknown): ParsedInbound | null` — returns `null` for `fromMe`, non-message, or unparseable events.

- [ ] **Step 1: Write failing tests** — append to `packages/integrations/src/evolution.test.ts`:

```ts
import { jidToPhone, parseInboundMessage } from "./evolution";

describe("jidToPhone", () => {
  it("strips the whatsapp suffix to digits", () => {
    expect(jidToPhone("94771234567@s.whatsapp.net")).toBe("94771234567");
  });
  it("keeps only digits for odd formats", () => {
    expect(jidToPhone("+94 77 123 4567@s.whatsapp.net")).toBe("94771234567");
  });
});

describe("parseInboundMessage", () => {
  const base = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    event: "messages.upsert",
    data: {
      key: { remoteJid: "94771234567@s.whatsapp.net", fromMe: false, id: "ABC123" },
      pushName: "Kamal",
      messageTimestamp: 1730000000,
      message,
      ...extra,
    },
  });

  it("parses a plain text message", () => {
    const r = parseInboundMessage(base({ conversation: "Hello" }));
    expect(r).not.toBeNull();
    expect(r!.phone).toBe("94771234567");
    expect(r!.keyId).toBe("ABC123");
    expect(r!.pushName).toBe("Kamal");
    expect(r!.kind).toBe("text");
    expect(r!.text).toBe("Hello");
    expect(r!.timestamp).toBe(1730000000);
  });

  it("parses an extendedTextMessage", () => {
    const r = parseInboundMessage(base({ extendedTextMessage: { text: "Hi again" } }));
    expect(r!.kind).toBe("text");
    expect(r!.text).toBe("Hi again");
  });

  it("parses an image with caption and base64", () => {
    const r = parseInboundMessage(
      base({ imageMessage: { caption: "fresh roses", mimetype: "image/jpeg" } }, { message: { imageMessage: { caption: "fresh roses", mimetype: "image/jpeg" } }, base64: "QUJD" }),
    );
    expect(r!.kind).toBe("image");
    expect(r!.text).toBe("fresh roses");
    expect(r!.mediaMime).toBe("image/jpeg");
    expect(r!.mediaBase64).toBe("QUJD");
  });

  it("returns null for fromMe echoes", () => {
    const e = base({ conversation: "my own reply" });
    (e.data.key as { fromMe: boolean }).fromMe = true;
    expect(parseInboundMessage(e)).toBeNull();
  });

  it("returns null for non-message events", () => {
    expect(parseInboundMessage({ event: "connection.update", data: {} })).toBeNull();
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage({})).toBeNull();
  });

  it("falls back to kind=other for unknown message types", () => {
    const r = parseInboundMessage(base({ stickerMessage: { mimetype: "image/webp" } }));
    expect(r!.kind).toBe("other");
    expect(r!.text).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @flowers/integrations test -- evolution`
Expected: FAIL (`jidToPhone`/`parseInboundMessage` not exported).

- [ ] **Step 3: Implement** — append to `packages/integrations/src/evolution.ts`:

```ts
/** Strip a WhatsApp JID (e.g. "9477...@s.whatsapp.net") to its digits. */
export function jidToPhone(jid: string): string {
  return (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
}

export interface ParsedInbound {
  remoteJid: string;
  phone: string;
  keyId: string | null;
  pushName: string | null;
  kind: "text" | "image" | "audio" | "document" | "other";
  text: string | null;
  mediaBase64: string | null;
  mediaMime: string | null;
  timestamp: number | null;
}

interface RawUpsert {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    messageTimestamp?: number | string;
    message?: Record<string, unknown> | null;
    base64?: string;
  };
}

/**
 * Normalize a single Evolution `messages.upsert` event. Returns null when the
 * event is not an inbound message we handle (wrong event, fromMe echo, no
 * message body). Tolerant of extra/unknown fields.
 */
export function parseInboundMessage(event: unknown): ParsedInbound | null {
  const e = event as RawUpsert | null;
  if (!e || typeof e !== "object") return null;
  if (e.event && e.event !== "messages.upsert") return null;
  const d = e.data;
  if (!d || !d.key || !d.message) return null;
  if (d.key.fromMe) return null;

  const remoteJid = d.key.remoteJid ?? "";
  if (!remoteJid) return null;

  const msg = d.message;
  let kind: ParsedInbound["kind"] = "other";
  let text: string | null = null;
  let mediaMime: string | null = null;

  if (typeof msg.conversation === "string") {
    kind = "text";
    text = msg.conversation;
  } else if (isObj(msg.extendedTextMessage)) {
    kind = "text";
    text = strOrNull(msg.extendedTextMessage.text);
  } else if (isObj(msg.imageMessage)) {
    kind = "image";
    text = strOrNull(msg.imageMessage.caption);
    mediaMime = strOrNull(msg.imageMessage.mimetype);
  } else if (isObj(msg.audioMessage)) {
    kind = "audio";
    mediaMime = strOrNull(msg.audioMessage.mimetype);
  } else if (isObj(msg.documentMessage)) {
    kind = "document";
    text = strOrNull(msg.documentMessage.fileName);
    mediaMime = strOrNull(msg.documentMessage.mimetype);
  }

  const tsRaw = d.messageTimestamp;
  const timestamp =
    typeof tsRaw === "number"
      ? tsRaw
      : typeof tsRaw === "string" && tsRaw.trim()
        ? Number(tsRaw)
        : null;

  return {
    remoteJid,
    phone: jidToPhone(remoteJid),
    keyId: d.key.id ?? null,
    pushName: strOrNull(d.pushName),
    kind,
    text,
    mediaBase64: kind === "image" ? strOrNull(d.base64) : null,
    mediaMime,
    timestamp: timestamp !== null && Number.isFinite(timestamp) ? timestamp : null,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @flowers/integrations test -- evolution`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/evolution.ts packages/integrations/src/evolution.test.ts
git commit -m "feat(integrations): parse Evolution inbound messages (text/image/other)"
```

---

### Task 3: WhatsApp data layer (repo)

**Files:**
- Create: `packages/api/src/repos/whatsapp.ts`
- Create: `packages/api/src/repos/whatsapp.test.ts`
- Modify: `packages/api/src/index.ts` (add `export * from "./repos/whatsapp";`)

**Interfaces:**
- Consumes: `Db` from `../db`, `schema` from `@flowers/db/client`, `ActionResult`/`ok`/`err` from `../errors`.
- Produces:
  - `buildPreview(kind: string, text: string | null): string` (pure)
  - `interface ConversationRow { id; remoteJid; phone; displayName: string|null; lastMessageAt: Date; lastPreview: string|null; unreadCount: number; }`
  - `interface MessageRow { id; direction: "inbound"|"outbound"; kind: string; text: string|null; mediaStoragePath: string|null; mediaMime: string|null; status: string; createdAt: Date; }`
  - `recordInboundMessage(db, input: RecordInboundInput): Promise<void>`
  - `recordOutboundMessage(db, input: RecordOutboundInput): Promise<void>`
  - `listConversations(db): Promise<ConversationRow[]>`
  - `getConversationMessages(db, conversationId: string): Promise<MessageRow[]>`
  - `markConversationRead(db, conversationId: string): Promise<void>`
  - `getConversationPhone(db, conversationId: string): Promise<string | null>`

- [ ] **Step 1: Write failing test** (pure helper only — DB fns follow repo convention of manual verification) `packages/api/src/repos/whatsapp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPreview } from "./whatsapp";

describe("buildPreview", () => {
  it("uses the text for a text message", () => {
    expect(buildPreview("text", "Hello there")).toBe("Hello there");
  });
  it("truncates long text to 120 chars with an ellipsis", () => {
    const long = "a".repeat(200);
    const p = buildPreview("text", long);
    expect(p.length).toBe(121);
    expect(p.endsWith("…")).toBe(true);
  });
  it("labels an image with no caption", () => {
    expect(buildPreview("image", null)).toBe("📷 Photo");
  });
  it("labels an image with its caption", () => {
    expect(buildPreview("image", "fresh roses")).toBe("📷 fresh roses");
  });
  it("labels audio and documents and other", () => {
    expect(buildPreview("audio", null)).toBe("🎤 Voice message");
    expect(buildPreview("document", "invoice.pdf")).toBe("📄 invoice.pdf");
    expect(buildPreview("other", null)).toBe("Message");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @flowers/api test -- whatsapp`
Expected: FAIL (`buildPreview` not found).

- [ ] **Step 3: Implement** `packages/api/src/repos/whatsapp.ts`:

```ts
/**
 * WhatsApp inbox data layer. Pure helpers (buildPreview) are unit-tested; DB
 * functions follow the repo convention (verified via the manual steps in the
 * plan, like createInvite). All writes run under the service-role client.
 */
import { desc, eq, sql } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "../db";

const PREVIEW_MAX = 120;

/** Build a short inbox-list preview from a message's kind + text. */
export function buildPreview(kind: string, text: string | null): string {
  const t = (text ?? "").trim();
  if (kind === "image") return t ? `📷 ${t}` : "📷 Photo";
  if (kind === "audio") return t ? `🎤 ${t}` : "🎤 Voice message";
  if (kind === "document") return t ? `📄 ${t}` : "📄 Document";
  if (!t) return "Message";
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX)}…` : t;
}

export interface ConversationRow {
  id: string;
  remoteJid: string;
  phone: string;
  displayName: string | null;
  lastMessageAt: Date;
  lastPreview: string | null;
  unreadCount: number;
}

export interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  text: string | null;
  mediaStoragePath: string | null;
  mediaMime: string | null;
  status: string;
  createdAt: Date;
}

export interface RecordInboundInput {
  remoteJid: string;
  phone: string;
  pushName: string | null;
  evolutionKeyId: string | null;
  kind: "text" | "image" | "audio" | "document" | "other";
  text: string | null;
  mediaStoragePath: string | null;
  mediaMime: string | null;
  remoteTimestamp: Date | null;
}

export interface RecordOutboundInput {
  phone: string;
  text: string;
}

/** Upsert the conversation for a JID, returning its id (and whether it is new). */
async function upsertConversation(
  db: Db,
  args: { remoteJid: string; phone: string; pushName: string | null; preview: string; bumpUnread: boolean },
): Promise<string> {
  const [row] = await db
    .insert(schema.whatsappConversations)
    .values({
      remoteJid: args.remoteJid,
      phone: args.phone,
      displayName: args.pushName,
      lastPreview: args.preview,
      lastMessageAt: new Date(),
      unreadCount: args.bumpUnread ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: schema.whatsappConversations.remoteJid,
      set: {
        lastPreview: args.preview,
        lastMessageAt: new Date(),
        // keep an existing displayName; only fill when we have a new name and none stored
        displayName: sql`coalesce(${schema.whatsappConversations.displayName}, ${args.pushName ?? null})`,
        unreadCount: args.bumpUnread
          ? sql`${schema.whatsappConversations.unreadCount} + 1`
          : schema.whatsappConversations.unreadCount,
      },
    })
    .returning({ id: schema.whatsappConversations.id });
  return row.id;
}

/** Record an inbound message. Idempotent on evolutionKeyId (webhook retries). */
export async function recordInboundMessage(db: Db, input: RecordInboundInput): Promise<void> {
  if (input.evolutionKeyId) {
    const [existing] = await db
      .select({ id: schema.whatsappMessages.id })
      .from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.evolutionKeyId, input.evolutionKeyId))
      .limit(1);
    if (existing) return; // retry — already stored, do not re-bump unread
  }

  const preview = buildPreview(input.kind, input.text);
  const conversationId = await upsertConversation(db, {
    remoteJid: input.remoteJid,
    phone: input.phone,
    pushName: input.pushName,
    preview,
    bumpUnread: true,
  });

  await db.insert(schema.whatsappMessages).values({
    conversationId,
    evolutionKeyId: input.evolutionKeyId,
    direction: "inbound",
    kind: input.kind,
    text: input.text,
    mediaStoragePath: input.mediaStoragePath,
    mediaMime: input.mediaMime,
    status: "received",
    remoteTimestamp: input.remoteTimestamp,
  });
}

/** Record an outbound message (reply or logged invite). Never bumps unread. */
export async function recordOutboundMessage(db: Db, input: RecordOutboundInput): Promise<void> {
  const remoteJid = `${input.phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const preview = buildPreview("text", input.text);
  const conversationId = await upsertConversation(db, {
    remoteJid,
    phone: input.phone.replace(/\D/g, ""),
    pushName: null,
    preview,
    bumpUnread: false,
  });
  await db.insert(schema.whatsappMessages).values({
    conversationId,
    evolutionKeyId: null,
    direction: "outbound",
    kind: "text",
    text: input.text,
    mediaStoragePath: null,
    mediaMime: null,
    status: "sent",
    remoteTimestamp: new Date(),
  });
}

export async function listConversations(db: Db): Promise<ConversationRow[]> {
  const rows = await db
    .select({
      id: schema.whatsappConversations.id,
      remoteJid: schema.whatsappConversations.remoteJid,
      phone: schema.whatsappConversations.phone,
      displayName: schema.whatsappConversations.displayName,
      lastMessageAt: schema.whatsappConversations.lastMessageAt,
      lastPreview: schema.whatsappConversations.lastPreview,
      unreadCount: schema.whatsappConversations.unreadCount,
    })
    .from(schema.whatsappConversations)
    .orderBy(desc(schema.whatsappConversations.lastMessageAt))
    .limit(200);
  return rows;
}

export async function getConversationMessages(db: Db, conversationId: string): Promise<MessageRow[]> {
  const rows = await db
    .select({
      id: schema.whatsappMessages.id,
      direction: schema.whatsappMessages.direction,
      kind: schema.whatsappMessages.kind,
      text: schema.whatsappMessages.text,
      mediaStoragePath: schema.whatsappMessages.mediaStoragePath,
      mediaMime: schema.whatsappMessages.mediaMime,
      status: schema.whatsappMessages.status,
      createdAt: schema.whatsappMessages.createdAt,
    })
    .from(schema.whatsappMessages)
    .where(eq(schema.whatsappMessages.conversationId, conversationId))
    .orderBy(schema.whatsappMessages.createdAt)
    .limit(500);
  return rows as MessageRow[];
}

export async function markConversationRead(db: Db, conversationId: string): Promise<void> {
  await db
    .update(schema.whatsappConversations)
    .set({ unreadCount: 0 })
    .where(eq(schema.whatsappConversations.id, conversationId));
}

export async function getConversationPhone(db: Db, conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ phone: schema.whatsappConversations.phone })
    .from(schema.whatsappConversations)
    .where(eq(schema.whatsappConversations.id, conversationId))
    .limit(1);
  return row?.phone ?? null;
}
```

- [ ] **Step 4: Export** — add to `packages/api/src/index.ts`:

```ts
export * from "./repos/whatsapp";
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @flowers/api test -- whatsapp`
Expected: PASS (buildPreview cases).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/repos/whatsapp.ts packages/api/src/repos/whatsapp.test.ts packages/api/src/index.ts
git commit -m "feat(api): whatsapp inbox data layer (record/list/read, idempotent inbound)"
```

---

### Task 4: Add `WHATSAPP_WEBHOOK_SECRET` env + constant-time compare

**Files:**
- Modify: `packages/api/src/env.ts` (add field + read)
- Create: `packages/api/src/repos/webhook-auth.ts` (pure `timingSafeEqualStr`)
- Create: `packages/api/src/repos/webhook-auth.test.ts`
- Modify: `packages/api/src/index.ts` (export the helper)

**Interfaces:**
- Produces:
  - `AppEnv.WHATSAPP_WEBHOOK_SECRET: string | undefined`
  - `timingSafeEqualStr(a: string, b: string): boolean`

- [ ] **Step 1: Write failing test** `packages/api/src/repos/webhook-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { timingSafeEqualStr } from "./webhook-auth";

describe("timingSafeEqualStr", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualStr("s3cret", "s3cret")).toBe(true);
  });
  it("returns false for different strings", () => {
    expect(timingSafeEqualStr("s3cret", "wrong")).toBe(false);
  });
  it("returns false for different lengths without throwing", () => {
    expect(timingSafeEqualStr("short", "longer-value")).toBe(false);
  });
  it("returns false for empty expected", () => {
    expect(timingSafeEqualStr("", "x")).toBe(false);
    expect(timingSafeEqualStr("x", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @flowers/api test -- webhook-auth`
Expected: FAIL (not found).

- [ ] **Step 3: Implement** `packages/api/src/repos/webhook-auth.ts`:

```ts
/**
 * Constant-time string compare for webhook secrets. Length mismatch short
 * circuits to false (safe: lengths are not secret). Avoids early-exit timing
 * leaks on the matching-length path.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

- [ ] **Step 4: Add env field** — in `packages/api/src/env.ts`, add to the `AppEnv` interface (near the Evolution block):

```ts
  /** Shared secret in the WhatsApp webhook URL path; guards the admin receive endpoint. */
  WHATSAPP_WEBHOOK_SECRET: string | undefined;
```

and add to the `getEnv()` return object:

```ts
    WHATSAPP_WEBHOOK_SECRET: read("WHATSAPP_WEBHOOK_SECRET"),
```

- [ ] **Step 5: Export helper** — add to `packages/api/src/index.ts`:

```ts
export * from "./repos/webhook-auth";
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm --filter @flowers/api test -- webhook-auth`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/env.ts packages/api/src/repos/webhook-auth.ts packages/api/src/repos/webhook-auth.test.ts packages/api/src/index.ts
git commit -m "feat(api): WHATSAPP_WEBHOOK_SECRET env + constant-time compare"
```

---

### Task 5: Inbound webhook route (admin)

**Files:**
- Create: `apps/admin/src/routes/api.whatsapp.webhook.$secret.ts`

**Interfaces:**
- Consumes: `getEnv`, `tryCreateDb`, `recordInboundMessage`, `timingSafeEqualStr` from `@flowers/api`; `parseInboundMessage` from `@flowers/integrations`; `createSupabaseAdminClient` from `@flowers/auth`.
- Produces: HTTP `POST /api/whatsapp/webhook/$secret` → 200 (handled/ignored), 404 (bad secret), 500 (unexpected; Evolution retries).

> This is a **server-only route** (exports only `server.handlers`, no React component) so supabase/db never reach the client bundle.

- [ ] **Step 1: Implement the route** `apps/admin/src/routes/api.whatsapp.webhook.$secret.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import {
  getEnv,
  tryCreateDb,
  recordInboundMessage,
  timingSafeEqualStr,
} from "@flowers/api";
import { parseInboundMessage } from "@flowers/integrations";
import { createSupabaseAdminClient } from "@flowers/auth";

const MEDIA_BUCKET = "whatsapp-media";

function extFor(mime: string | null): string {
  if (!mime) return "bin";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

/** Decode base64 to bytes (Workers-native atob). */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const Route = createFileRoute("/api/whatsapp/webhook/$secret")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const env = getEnv();
        if (
          !env.WHATSAPP_WEBHOOK_SECRET ||
          !timingSafeEqualStr(params.secret, env.WHATSAPP_WEBHOOK_SECRET)
        ) {
          return new Response("Not found", { status: 404 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("ok", { status: 200 }); // nothing to do
        }

        const parsed = parseInboundMessage(body);
        if (!parsed) return new Response("ok", { status: 200 });

        const db = tryCreateDb();
        if (!db) return new Response("db unavailable", { status: 500 });

        try {
          // Store image media (best-effort) in the public whatsapp-media bucket.
          let mediaStoragePath: string | null = null;
          if (parsed.kind === "image" && parsed.mediaBase64) {
            if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
              try {
                const supabase = createSupabaseAdminClient({
                  url: env.SUPABASE_URL,
                  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
                });
                const key = `inbound/${parsed.phone}/${parsed.keyId ?? crypto.randomUUID()}.${extFor(parsed.mediaMime)}`;
                const { error } = await supabase.storage
                  .from(MEDIA_BUCKET)
                  .upload(key, b64ToBytes(parsed.mediaBase64), {
                    contentType: parsed.mediaMime ?? "application/octet-stream",
                    upsert: true,
                  });
                if (!error) mediaStoragePath = key;
              } catch {
                // media upload is best-effort; fall through storing the row w/o media
              }
            }
          }

          await recordInboundMessage(db, {
            remoteJid: parsed.remoteJid,
            phone: parsed.phone,
            pushName: parsed.pushName,
            evolutionKeyId: parsed.keyId,
            kind: parsed.kind,
            text: parsed.text,
            mediaStoragePath,
            mediaMime: parsed.mediaMime,
            remoteTimestamp: parsed.timestamp ? new Date(parsed.timestamp * 1000) : null,
          });

          return new Response("ok", { status: 200 });
        } catch {
          return new Response("error", { status: 500 }); // safe: idempotent retry
        }
      },
    },
  },
});
```

- [ ] **Step 2: Typecheck the admin app**

Run: `pnpm --filter @flowers/admin build && pnpm --filter @flowers/admin typecheck`
Expected: PASS (route compiles; `routeTree.gen.ts` includes the new route).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/routes/api.whatsapp.webhook.$secret.ts
git commit -m "feat(admin): secret-gated WhatsApp inbound webhook (+ media to Storage)"
```

---

### Task 6: Admin server fns + invite-send logging

**Files:**
- Create: `apps/admin/src/server/whatsapp.ts`
- Modify: `apps/admin/src/server/suppliers.ts` (log a successful invite send)

**Interfaces:**
- Consumes: `resolveAdminSession` from `./session`; data-layer fns from `@flowers/api`; `sendWhatsappText` from `@flowers/integrations`.
- Produces (server fns):
  - `listWhatsappConversationsFn(): Promise<ConversationRow[]>`
  - `getWhatsappThreadFn({ conversationId }): Promise<MessageRow[]>`
  - `sendWhatsappReplyFn({ conversationId, text }): Promise<ActionResult<{ sent: true }>>`

- [ ] **Step 1: Implement** `apps/admin/src/server/whatsapp.ts`:

```ts
/**
 * Admin WhatsApp inbox server functions. Reads/writes the whatsapp_* tables and
 * replies via the shared Evolution instance. Admin-gated.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  getEnv,
  tryCreateDb,
  listConversations,
  getConversationMessages,
  markConversationRead,
  getConversationPhone,
  recordOutboundMessage,
  type ActionResult,
  type ConversationRow,
  type MessageRow,
} from "@flowers/api";
import { sendWhatsappText } from "@flowers/integrations";
import { resolveAdminSession } from "./session";

async function requireAdmin() {
  const session = await resolveAdminSession();
  if (
    session.kind === "anonymous" ||
    session.kind === "config_error" ||
    session.kind === "forbidden"
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

export const listWhatsappConversationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConversationRow[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    return listConversations(db);
  },
);

export const getWhatsappThreadFn = createServerFn({ method: "GET" })
  .validator((input: { conversationId: string }) => input)
  .handler(async ({ data }): Promise<MessageRow[]> => {
    await requireAdmin();
    const db = tryCreateDb();
    if (!db) return [];
    const messages = await getConversationMessages(db, data.conversationId);
    await markConversationRead(db, data.conversationId);
    return messages;
  });

export const sendWhatsappReplyFn = createServerFn({ method: "POST" })
  .validator((input: { conversationId: string; text: string }) => input)
  .handler(async ({ data }): Promise<ActionResult<{ sent: true }>> => {
    await requireAdmin();
    const text = data.text.trim();
    if (!text) return { ok: false, code: "validation", message: "Message is empty." };

    const db = tryCreateDb();
    if (!db) return { ok: false, code: "db_unavailable", message: "Database is not configured." };

    const env = getEnv();
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) {
      return { ok: false, code: "db_unavailable", message: "WhatsApp is not configured." };
    }

    const phone = await getConversationPhone(db, data.conversationId);
    if (!phone) return { ok: false, code: "not_found", message: "Conversation not found." };

    const res = await sendWhatsappText(
      {
        apiUrl: env.EVOLUTION_API_URL,
        apiKey: env.EVOLUTION_API_KEY,
        instance: env.EVOLUTION_INSTANCE,
      },
      phone,
      text,
    );
    if (!res.ok) return { ok: false, code: "unknown", message: res.message };

    await recordOutboundMessage(db, { phone, text });
    return { ok: true, data: { sent: true } };
  });
```

- [ ] **Step 2: Log successful invite sends** — in `apps/admin/src/server/suppliers.ts`:

Add `recordOutboundMessage` to the existing `@flowers/api` import list, then replace the WhatsApp send block inside `inviteSupplierFn` with one that logs on success:

```ts
      let whatsappSent = false;
      if (env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE) {
        const res = await sendWhatsappText(
          {
            apiUrl: env.EVOLUTION_API_URL,
            apiKey: env.EVOLUTION_API_KEY,
            instance: env.EVOLUTION_INSTANCE,
          },
          data.phone.trim(),
          message,
        );
        whatsappSent = res.ok;
        if (res.ok) {
          try {
            await recordOutboundMessage(db, { phone: data.phone.trim(), text: message });
          } catch {
            // logging into the inbox is best-effort; never fail the invite
          }
        }
      }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @flowers/admin build && pnpm --filter @flowers/admin typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/server/whatsapp.ts apps/admin/src/server/suppliers.ts
git commit -m "feat(admin): WhatsApp inbox server fns + log invite sends to thread"
```

---

### Task 7: Admin inbox UI + sidebar link + end-to-end verification

**Files:**
- Create: `apps/admin/src/routes/whatsapp.tsx`
- Modify: `apps/admin/src/routes/__root.tsx` (add nav item)

**Interfaces:**
- Consumes: `listWhatsappConversationsFn`, `getWhatsappThreadFn`, `sendWhatsappReplyFn` from `../server/whatsapp`.

- [ ] **Step 1: Add the nav link** — in `apps/admin/src/routes/__root.tsx`, add to the nav items array (after the Suppliers entry):

```ts
  { to: "/whatsapp", label: "WhatsApp", exact: false },
```

- [ ] **Step 2: Implement the inbox route** `apps/admin/src/routes/whatsapp.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listWhatsappConversationsFn,
  getWhatsappThreadFn,
  sendWhatsappReplyFn,
} from "../server/whatsapp";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsappInbox,
});

const SUPABASE_PUBLIC = import.meta.env.VITE_SUPABASE_URL as string | undefined;
function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (!SUPABASE_PUBLIC) return null;
  return `${SUPABASE_PUBLIC.replace(/\/$/, "")}/storage/v1/object/public/whatsapp-media/${path}`;
}

function WhatsappInbox() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const conversations = useQuery({
    queryKey: ["wa", "conversations"],
    queryFn: () => listWhatsappConversationsFn(),
    refetchInterval: 5000,
  });

  const thread = useQuery({
    queryKey: ["wa", "thread", selected],
    queryFn: () => getWhatsappThreadFn({ data: { conversationId: selected! } }),
    enabled: !!selected,
    refetchInterval: 5000,
  });

  async function send() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    const res = await sendWhatsappReplyFn({ data: { conversationId: selected, text } });
    if (!res.ok) {
      setDraft(text);
      alert(res.message); // minimal; replace with the admin toast util if present
    }
    await qc.invalidateQueries({ queryKey: ["wa", "thread", selected] });
    await qc.invalidateQueries({ queryKey: ["wa", "conversations"] });
    setSending(false);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation list */}
      <aside className="w-72 shrink-0 overflow-y-auto rounded-lg border border-black/10 bg-white">
        <h1 className="px-4 py-3 text-lg font-semibold">WhatsApp</h1>
        {(conversations.data ?? []).map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`flex w-full flex-col gap-0.5 border-t border-black/5 px-4 py-3 text-left hover:bg-black/5 ${
              selected === c.id ? "bg-black/5" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.displayName ?? `+${c.phone}`}</span>
              {c.unreadCount > 0 && (
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">
                  {c.unreadCount}
                </span>
              )}
            </div>
            <span className="truncate text-sm text-black/60">{c.lastPreview}</span>
          </button>
        ))}
        {conversations.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-black/50">No conversations yet.</p>
        )}
      </aside>

      {/* Thread */}
      <section className="flex flex-1 flex-col rounded-lg border border-black/10 bg-white">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-black/40">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(thread.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "ml-auto bg-emerald-600 text-white"
                      : "bg-black/5"
                  }`}
                >
                  {m.kind === "image" && mediaUrl(m.mediaStoragePath) && (
                    <img
                      src={mediaUrl(m.mediaStoragePath)!}
                      alt={m.text ?? "photo"}
                      className="mb-1 max-h-60 rounded"
                    />
                  )}
                  {m.text && <span>{m.text}</span>}
                  {!m.text && m.kind !== "image" && (
                    <span className="italic opacity-70">[{m.kind}]</span>
                  )}
                </div>
              ))}
            </div>
            <form
              className="flex gap-2 border-t border-black/10 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a reply…"
                className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
```

> Note: `VITE_SUPABASE_URL` must be exposed to the admin client build for image URLs. If the admin app doesn't already expose it, add `VITE_SUPABASE_URL` to `apps/admin/.dev.vars` and the Worker vars; if a different public-URL convention exists in admin, follow it. Images simply won't render (text still works) if it's absent.

- [ ] **Step 3: Full typecheck + tests + build**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: PASS across the workspace.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/routes/whatsapp.tsx apps/admin/src/routes/__root.tsx
git commit -m "feat(admin): WhatsApp two-way inbox UI + sidebar link"
```

- [ ] **Step 5: Manual end-to-end verification** (after Task 8 config is applied):

1. **Apply the migration** to the DB (Task 8), then confirm:
   `select to_regclass('public.whatsapp_messages'), to_regclass('public.whatsapp_conversations');` → both non-null.
2. **Inbound text:** WhatsApp the number → within ~5s a conversation appears in `/whatsapp` with an unread badge; opening it clears the badge.
3. **Idempotency (Review Focus):** re-deliver the same event (Evolution "resend" or replay the same `key.id` payload to the webhook) → **no duplicate** message row, `unread_count` **not** double-incremented.
4. **Inbound photo:** send a photo with a caption → thumbnail renders inline, caption shows beneath.
5. **Reply:** type a reply + Send → arrives on the phone; appears right-aligned in the thread.
6. **Invite:** on `/suppliers/invite`, send an invite → banner shows the **sent** state (not "not configured"); the invite text appears as an outbound message in that number's thread.
7. **Bad secret (Review Focus):** `curl -X POST https://admin.flowermarket.lk/api/whatsapp/webhook/wrong` → **404**.

---

### Task 8: Operator config + ops documentation

**Files:**
- Create: `docs/whatsapp-setup.md`
- Modify: `apps/admin/.dev.vars`, `apps/web/.dev.vars`, `apps/supplier/.dev.vars` (local dev values — real values, not committed secrets)

**Interfaces:** none (ops/docs).

- [ ] **Step 1: Write** `docs/whatsapp-setup.md` with the exact steps:

```md
# WhatsApp (Evolution API) setup

One Evolution instance / one number is shared by web + supplier + admin for
sending. Only **admin** receives (hosts the webhook + inbox).

## 1. Worker secrets (run with CLOUDFLARE_ACCOUNT_ID set — see deploy notes)

All three apps (send):
    wrangler secret put EVOLUTION_API_URL      # https://<your-evolution-host>
    wrangler secret put EVOLUTION_API_KEY
    wrangler secret put EVOLUTION_INSTANCE
(run inside apps/web, apps/supplier, apps/admin)

Admin only (receive + media):
    cd apps/admin
    wrangler secret put WHATSAPP_WEBHOOK_SECRET   # long random string, e.g. openssl rand -hex 24
    wrangler secret put SUPABASE_SERVICE_ROLE_KEY # if not already set

## 2. Supabase Storage
Create a PUBLIC bucket named `whatsapp-media`.

## 3. Migration (manual — prod journal is drifted)
Apply packages/db/migrations/0018_whatsapp_inbox.sql against DIRECT_DATABASE_URL
(e.g. `psql "$DIRECT_DATABASE_URL" -f packages/db/migrations/0018_whatsapp_inbox.sql`),
then verify:
    select to_regclass('public.whatsapp_conversations'),
           to_regclass('public.whatsapp_messages');

## 4. Register the webhook on the Evolution instance (one-time)
Confirm the field shape against your Evolution version first (v1 vs v2 differ).
Common (Evolution v2):
    curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
      -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
      -d '{"webhook":{"enabled":true,
           "url":"https://admin.flowermarket.lk/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_SECRET>",
           "webhookByEvents":false,"base64":true,
           "events":["MESSAGES_UPSERT"]}}'

Verify:
    curl "$EVOLUTION_API_URL/webhook/find/$EVOLUTION_INSTANCE" -H "apikey: $EVOLUTION_API_KEY"

## 5. Local dev
Put real values in apps/{web,supplier,admin}/.dev.vars (same keys). For admin
also set WHATSAPP_WEBHOOK_SECRET and VITE_SUPABASE_URL. Use a tunnel (cloudflared
/ ngrok) if you want to receive webhooks locally.
```

- [ ] **Step 2: Set local `.dev.vars`** — replace the dummy Evolution values in `apps/admin/.dev.vars` with real ones and add `WHATSAPP_WEBHOOK_SECRET` + `VITE_SUPABASE_URL`; fill the Evolution keys in `apps/web/.dev.vars` and `apps/supplier/.dev.vars`. (Operator-provided values; `.dev.vars` is gitignored.)

- [ ] **Step 3: Commit the doc**

```bash
git add docs/whatsapp-setup.md
git commit -m "docs(whatsapp): Evolution container setup + webhook registration"
```

- [ ] **Step 4: Deploy + run the Task 7 Step 5 verification** against production.
```
