/**
 * Server-only session helpers for the Admin Portal.
 * NEVER import this module from client components — it touches TanStack
 * Start's request-scoped cookie APIs.
 */
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { createSupabaseServerClient, hasRole } from "@flowers/auth";
import { getEnv, tryCreateDb, getUserRole } from "@flowers/api";

/**
 * The session union every route sees via router context.
 * - `auth_disabled` — AUTH_DISABLED=1 set; dev browsing without accounts.
 * - `config_error`  — Supabase env vars absent without AUTH_DISABLED=1 (fail closed).
 * - `anonymous`     — Supabase configured, no valid session cookie.
 * - `forbidden`     — authenticated but not an admin (role unverifiable or wrong role).
 * - `admin`         — authenticated with admin role.
 */
export type AdminSession =
  | { kind: "auth_disabled" }
  | { kind: "config_error" }
  | { kind: "anonymous" }
  | { kind: "forbidden"; email: string }
  | { kind: "admin"; userId: string; email: string };

type SetCookieOptions = Parameters<typeof setCookie>[2];

export function getSupabase() {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  return createSupabaseServerClient(
    { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
    {
      getAll: () =>
        Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) {
          setCookie(c.name, c.value, c.options as SetCookieOptions);
        }
      },
    },
  );
}

export async function resolveAdminSession(): Promise<AdminSession> {
  const supabase = getSupabase();
  if (!supabase) {
    // Only treat missing Supabase env as intentional when AUTH_DISABLED=1.
    // Otherwise fail closed — the admin portal must not grant access.
    const { AUTH_DISABLED } = getEnv();
    return AUTH_DISABLED ? { kind: "auth_disabled" } : { kind: "config_error" };
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { kind: "anonymous" };

  const email = user.email ?? "";

  // Look up the user's role in the DB. If the DB is unavailable treat as forbidden.
  const db = tryCreateDb();
  if (!db) return { kind: "forbidden", email };

  const role = await getUserRole(db, user.id);

  if (!role || !hasRole(role, ["admin"])) {
    return { kind: "forbidden", email };
  }

  return { kind: "admin", userId: user.id, email };
}
