/**
 * Server-only session helpers shared by the auth server functions.
 * NEVER import this module from client components — it touches TanStack
 * Start's request-scoped cookie APIs.
 */
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { createSupabaseServerClient, type SupabaseEnv } from "@flowers/auth";
import { getEnv } from "@flowers/api";

/**
 * The session union every route sees via router context.
 * - `auth_disabled` — AUTH_DISABLED=1 set; browsing works, accounts don't.
 * - `config_error`  — Supabase env vars absent without AUTH_DISABLED=1 (fail closed).
 * - `anonymous` — Supabase configured, no valid session cookie.
 * - `authenticated` — a verified Supabase user.
 */
export type SessionUser =
  | { kind: "auth_disabled" }
  | { kind: "config_error" }
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      userId: string;
      email: string;
      fullName: string | null;
    };

/** Supabase env pair, or null when auth is not configured. */
export function supabaseEnv(): SupabaseEnv | null {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

type SetCookieOptions = Parameters<typeof setCookie>[2];

/**
 * Bridge @supabase/ssr's getAll/setAll contract onto TanStack Start's
 * request-scoped cookie helpers so refreshed tokens really produce
 * Set-Cookie headers on the outgoing response.
 */
export function cookieAdapter(): Parameters<
  typeof createSupabaseServerClient
>[1] {
  return {
    getAll: () =>
      Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
    setAll: (cookies) => {
      for (const cookie of cookies) {
        setCookie(
          cookie.name,
          cookie.value,
          cookie.options as SetCookieOptions,
        );
      }
    },
  };
}

/** Request-scoped Supabase server client, or null when auth is disabled. */
export function trySupabaseServer() {
  const env = supabaseEnv();
  if (!env) return null;
  return createSupabaseServerClient(env, cookieAdapter());
}

/**
 * Resolve the current session from cookies.
 */
export async function resolveSessionUser(): Promise<SessionUser> {
  const supabase = trySupabaseServer();
  if (!supabase) {
    // Only treat missing Supabase env as intentional when AUTH_DISABLED=1.
    // Otherwise fail closed — no access granted.
    const { AUTH_DISABLED } = getEnv();
    return AUTH_DISABLED ? { kind: "auth_disabled" } : { kind: "config_error" };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { kind: "anonymous" };

  const user = data.user;
  const email = user.email ?? "";
  const metaName: unknown = user.user_metadata?.full_name;
  const fullName = typeof metaName === "string" && metaName ? metaName : null;

  return { kind: "authenticated", userId: user.id, email, fullName };
}
