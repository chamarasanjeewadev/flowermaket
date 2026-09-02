import { createBrowserClient, createServerClient } from "@supabase/ssr";

export type AppRole = "buyer" | "supplier" | "admin";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
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
