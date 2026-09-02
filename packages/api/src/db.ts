import { createDb, type Db } from "@flowers/db/client";
import { DataUnavailableError } from "./errors";
import { getEnv } from "./env";

export type { Db };

/**
 * Create a database client for the current request, or `null` when
 * DATABASE_URL is not configured (callers then degrade gracefully).
 *
 * A NEW client is created per call on purpose: Cloudflare Workers forbid
 * sharing I/O objects (sockets, connections) across requests, so caching a
 * client in module scope would throw "Cannot perform I/O on behalf of a
 * different request". `createDb` uses the Supabase transaction pooler with
 * `max: 1`, so per-request clients stay cheap.
 */
export function tryCreateDb(): Db | null {
  const { DATABASE_URL } = getEnv();
  if (!DATABASE_URL) return null;
  return createDb(DATABASE_URL);
}

/** Like {@link tryCreateDb} but throws for flows that cannot run without a database (mutations). */
export function requireDb(): Db {
  const db = tryCreateDb();
  if (!db) throw new DataUnavailableError();
  return db;
}
