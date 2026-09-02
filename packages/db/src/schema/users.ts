import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { language, userRole } from "./enums";

/**
 * Mirrors Supabase `auth.users` (same UUID). A row is inserted by a
 * `handle_new_user` trigger when someone signs up via Supabase Auth.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // = auth.users.id, no default
  role: userRole("role").notNull().default("buyer"),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  fullName: text("full_name"),
  preferredLanguage: language("preferred_language").default("en"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
