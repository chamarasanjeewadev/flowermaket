/**
 * WhatsApp inbox tools. Mirrors apps/admin/src/server/whatsapp.ts. Inbound
 * messages arrive via the admin webhook; these tools read and reply.
 */
import { z } from "zod";
import {
  err,
  getConversationMessages,
  getConversationPhone,
  listConversations,
  markConversationRead,
  ok,
} from "@flowers/api";
import { getWhatsappStatus } from "@flowers/integrations";
import { defineTool, uuid, type AnyTool } from "../tool";
import { sendAndLog } from "../whatsapp-send";

function mediaUrl(path: string | null, supabaseUrl: string | undefined): string | null {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/whatsapp-media/${path}`;
}

export const whatsappTools: AnyTool[] = [
  defineTool({
    name: "whatsapp_status",
    title: "WhatsApp connection status",
    description: "Whether the shared Evolution GO WhatsApp instance is configured and connected.",
    kind: "read",
    input: {},
    async run(_args, ctx) {
      return ok(await getWhatsappStatus(ctx.evolution()));
    },
  }),

  defineTool({
    name: "list_whatsapp_conversations",
    title: "List WhatsApp conversations",
    description: "Inbox threads, most recent first, with last-message preview and unread count.",
    kind: "read",
    input: {
      unreadOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(30),
    },
    async run({ unreadOnly, limit }, ctx) {
      const rows = await listConversations(ctx.db());
      const filtered = unreadOnly ? rows.filter((c) => c.unreadCount > 0) : rows;
      return ok(filtered.slice(0, limit));
    },
  }),

  defineTool({
    name: "get_whatsapp_conversation",
    title: "Read a WhatsApp conversation",
    description:
      "All messages in one thread, oldest first, with photo URLs. Does not clear the unread badge " +
      "unless markRead=true, so a human still sees it as new.",
    kind: "read",
    input: {
      conversationId: uuid("Conversation id"),
      lastN: z.number().int().min(1).max(500).default(50).describe("Only the most recent N messages"),
      markRead: z.boolean().default(false),
    },
    async run({ conversationId, lastN, markRead }, ctx) {
      const db = ctx.db();
      const phone = await getConversationPhone(db, conversationId);
      if (!phone) return err("not_found", "Conversation not found.");
      const supabaseUrl = ctx.env().SUPABASE_URL;
      const messages = (await getConversationMessages(db, conversationId))
        .slice(-lastN)
        .map((m) => ({ ...m, mediaUrl: mediaUrl(m.mediaStoragePath, supabaseUrl) }));
      if (markRead) await markConversationRead(db, conversationId);
      return ok({ phone, messages });
    },
  }),

  defineTool({
    name: "mark_whatsapp_conversation_read",
    title: "Mark a conversation read",
    description: "Clear a thread's unread badge once it has been handled.",
    kind: "write",
    input: { conversationId: uuid("Conversation id") },
    async run({ conversationId }, ctx) {
      await markConversationRead(ctx.db(), conversationId);
      return ok(undefined);
    },
  }),

  defineTool({
    name: "send_whatsapp_reply",
    title: "Reply on WhatsApp",
    description:
      "SEND a WhatsApp text to the customer/supplier in an existing conversation, from the " +
      "FlowerMarket.lk number. The message is logged in the admin inbox.",
    kind: "send",
    input: {
      conversationId: uuid("Conversation id"),
      text: z.string().trim().min(1).max(4000),
    },
    async run({ conversationId, text }, ctx) {
      const db = ctx.db();
      const phone = await getConversationPhone(db, conversationId);
      if (!phone) return err("not_found", "Conversation not found.");
      const res = await sendAndLog(db, ctx.evolution(), phone, text);
      if (!res.ok) return err("unknown", `WhatsApp send failed: ${res.message}`);
      return ok({ sent: true, phone });
    },
  }),
];
