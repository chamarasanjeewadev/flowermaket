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
  const preview = buildPreview(input.kind, input.text);

  // Ensure the conversation exists + refresh preview/time. No unread bump here.
  const conversationId = await upsertConversation(db, {
    remoteJid: input.remoteJid,
    phone: input.phone,
    pushName: input.pushName,
    preview,
    bumpUnread: false,
  });

  // Insert the message idempotently. A webhook retry (same evolutionKeyId)
  // conflicts and returns no row — so we neither duplicate nor re-bump unread.
  // (evolutionKeyId null never conflicts, which is correct — null can't be deduped.)
  const inserted = await db
    .insert(schema.whatsappMessages)
    .values({
      conversationId,
      evolutionKeyId: input.evolutionKeyId,
      direction: "inbound",
      kind: input.kind,
      text: input.text,
      mediaStoragePath: input.mediaStoragePath,
      mediaMime: input.mediaMime,
      status: "received",
      remoteTimestamp: input.remoteTimestamp,
    })
    .onConflictDoNothing({ target: schema.whatsappMessages.evolutionKeyId })
    .returning({ id: schema.whatsappMessages.id });

  // Only a genuinely new inbound message bumps the unread counter.
  if (inserted.length > 0) {
    await db
      .update(schema.whatsappConversations)
      .set({ unreadCount: sql`${schema.whatsappConversations.unreadCount} + 1` })
      .where(eq(schema.whatsappConversations.id, conversationId));
  }
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
