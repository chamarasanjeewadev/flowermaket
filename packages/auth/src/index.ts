import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export type AppRole = "buyer" | "supplier" | "admin";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseAdminEnv {
  url: string;
  serviceRoleKey: string;
}

/**
 * Service-role Supabase client for privileged server-side work (e.g. Storage
 * uploads). Bypasses RLS — NEVER expose this to the browser or use it with
 * user-supplied identities without an explicit app-layer ownership check.
 * Session persistence is disabled: it is stateless per request on Workers.
 */
export function createSupabaseAdminClient(env: SupabaseAdminEnv) {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Browser-side Supabase client (one per app, created once). */
export function createSupabaseBrowserClient(env: SupabaseEnv) {
  return createBrowserClient(env.url, env.anonKey);
}

/**
 * Server-side Supabase client for TanStack Start server functions.
 * Pass cookie get/set adapters from the request context.
 */
export function createSupabaseServerClient(
  env: SupabaseEnv,
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (
      cookies: Array<{ name: string; value: string; options?: object }>,
    ) => void;
  },
) {
  return createServerClient(env.url, env.anonKey, { cookies });
}

/** Role check helper — the DB (RLS) remains the source of truth. */
export function hasRole(
  userRole: string | undefined,
  allowed: AppRole[],
): boolean {
  return !!userRole && (allowed as string[]).includes(userRole);
}

export interface VerifiedUser {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * Resolve the signed-in user from the session cookie with a verified JWT.
 *
 * Uses `auth.getClaims()`, which verifies the access token locally against the
 * project's cached JWKS (asymmetric signing keys) instead of a round trip to
 * the Auth server on every request — the main per-navigation latency cost on
 * Workers. Projects still on a symmetric (HS256) secret fall back to a server
 * check inside getClaims, so this is never less safe than `getUser()`.
 */
export async function getVerifiedUser(
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta: unknown = claims.user_metadata;
  const fullName =
    meta && typeof meta === "object" && "full_name" in meta && typeof meta.full_name === "string"
      ? meta.full_name || null
      : null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName,
  };
}
