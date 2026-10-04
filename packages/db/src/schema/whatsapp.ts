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
