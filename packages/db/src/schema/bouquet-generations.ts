import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const bouquetGenerations = pgTable(
  "bouquet_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    ipAddress: text("ip_address").notNull(),
    imageStoragePath: text("image_storage_path"),
    imagePublicUrl: text("image_public_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bouquet_gen_user_id_idx").on(t.userId),
    index("bouquet_gen_ip_idx").on(t.ipAddress),
    index("bouquet_gen_created_at_idx").on(t.createdAt),
  ],
);
