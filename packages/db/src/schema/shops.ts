import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { shopType, verificationStatus } from "./enums";
import { users } from "./users";

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .references(() => users.id)
      .notNull(),
    slug: text("slug").unique().notNull(),
    shopType: shopType("shop_type").notNull().default("florist"),
    nameEn: text("name_en").notNull(),
    nameSi: text("name_si"),
    descriptionEn: text("description_en"),
    descriptionSi: text("description_si"),
    district: text("district").notNull(),
    city: text("city"),
    logoPath: text("logo_path"),
    bannerPath: text("banner_path"),
    verificationStatus: verificationStatus("verification_status")
      .notNull()
      .default("unverified"),
    /** Commission in basis points; null = use platform default. */
    commissionRateBps: integer("commission_rate_bps"),
    bankDetails: jsonb("bank_details"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("shops_owner_user_id_idx").on(t.ownerUserId)],
);
