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
