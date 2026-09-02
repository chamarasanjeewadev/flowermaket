import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

/**
 * Server-only Drizzle client.
 *
 * On Cloudflare Workers use the Supabase *transaction* pooler URL (port 6543)
 * and keep `max: 1` — each isolate holds at most one connection.
 */
export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
