/**
 * Per-process context shared by every tool: one lazily-created DB client, the
 * acting admin identity, and Evolution (WhatsApp) config.
 *
 * Caching the DB client is safe here — this is a long-lived Node process, not
 * a Worker, so the per-request client rule in packages/api/src/db.ts does not
 * apply.
 */
import {
  DataUnavailableError,
  err,
  getEnv,
  getUserByEmail,
  getUserRole,
  ok,
  tryCreateDb,
  type ActionResult,
  type AppEnv,
  type Db,
} from "@flowers/api";
import type { EvolutionConfig } from "@flowers/integrations";

export interface ActingAdmin {
  userId: string;
  email: string;
}

export interface Ctx {
  env(): AppEnv;
  /** Throws DataUnavailableError when DATABASE_URL is not configured. */
  db(): Db;
  /**
   * The admin user writes are attributed to (orders.created_by_user_id and
   * documents.created_by_user_id are NOT NULL FKs). Resolved from
   * FLOWERS_ADMIN_EMAIL and verified to hold the admin role.
   */
  actingAdmin(): Promise<ActionResult<ActingAdmin>>;
  /** Empty strings make sendWhatsappText / getWhatsappStatus report "not configured". */
  evolution(): EvolutionConfig;
}

export function createContext(): Ctx {
  let db: Db | null = null;
  let admin: ActingAdmin | null = null;

  const ctx: Ctx = {
    env: () => getEnv(),
    db() {
      if (db) return db;
      db = tryCreateDb();
      if (!db) throw new DataUnavailableError();
      return db;
    },
    async actingAdmin() {
      if (admin) return ok(admin);
      const email = process.env.FLOWERS_ADMIN_EMAIL?.trim().toLowerCase();
      if (!email) {
        return err(
          "auth_required",
          "Set FLOWERS_ADMIN_EMAIL to an admin account's email so writes can be attributed.",
        );
      }
      const database = ctx.db();
      const user = await getUserByEmail(database, email);
      if (!user) return err("auth_required", `No user with email ${email}.`);
      const role = await getUserRole(database, user.id);
      if (role !== "admin") {
        return err("forbidden", `${email} does not have the admin role.`);
      }
      admin = { userId: user.id, email: user.email };
      return ok(admin);
    },
    evolution() {
      const env = getEnv();
      return {
        apiUrl: env.EVOLUTION_API_URL ?? "",
        apiKey: env.EVOLUTION_API_KEY ?? "",
        instance: env.EVOLUTION_INSTANCE ?? "",
      };
    },
  };
  return ctx;
}
