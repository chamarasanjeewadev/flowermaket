import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { language, sellerType } from "./enums";
import { users } from "./users";
import { shops } from "./shops";

/**
 * Outbound supplier invitations. Admin finds a WhatsApp number (farmer,
 * middleman, or florist) and sends a benefits pitch + tokenized join link.
 * Status: sent → accepted (on self-serve registration) or expired.
 */
export const supplierInvites = pgTable(
  "supplier_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    nameEn: text("name_en"),
    /** Suggested seller types; null leaves it to the supplier at registration. */
    sellerTypes: sellerType("seller_types").array(),
    language: language("language").notNull().default("en"),
    token: text("token").unique().notNull(),
    /** sent | accepted | expired */
    status: text("status").notNull().default("sent"),
    sentBy: uuid("sent_by").references(() => users.id),
    acceptedShopId: uuid("accepted_shop_id").references(() => shops.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [index("supplier_invites_phone_idx").on(t.phone)],
);
