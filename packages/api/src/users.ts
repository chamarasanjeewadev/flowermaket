/**
 * Thin user-row helpers used by the portal session resolvers.
 * Keeps drizzle-orm imports out of app code (apps depend on @flowers/api, not
 * on drizzle-orm directly).
 */
import { eq } from "drizzle-orm";
import { schema } from "@flowers/db/client";
import type { Db } from "./db";

export type AppRoleValue = "buyer" | "supplier" | "admin";

/**
 * Look up a user's role from the `users` table.
 * Returns null when the user row does not exist.
 */
export async function getUserRole(
  db: Db,
  userId: string,
): Promise<AppRoleValue | null> {
  const [row] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return row ? (row.role as AppRoleValue) : null;
}
