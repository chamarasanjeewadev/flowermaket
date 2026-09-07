/**
 * Auth server functions for the Admin Portal.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { getEnv } from "@flowers/api";
import { getSupabase, resolveAdminSession, type AdminSession } from "./session";

export type { AdminSession };

export interface SignInResult {
  ok: boolean;
  message?: string;
}

/** Current site origin for OAuth redirects (env first, then the request). */
function currentOrigin(): string {
  const configured = getEnv().SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return getRequestUrl().origin;
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSession> => resolveAdminSession(),
);

export const signIn = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => input)
  .handler(async ({ data }): Promise<SignInResult> => {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        ok: false,
        message:
          'Supabase is not configured — the portal is running in dev mode. Use "Continue to dashboard".',
      };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean }> => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    return { ok: true };
  },
);

/**
 * Build the Google OAuth URL server-side (PKCE verifier lands in a cookie via
 * the adapter); the client then does `window.location.assign(url)`.
 */
export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .validator((data: { redirect?: string }) => data)
  .handler(
    async ({ data }): Promise<SignInResult & { url?: string }> => {
      const supabase = getSupabase();
      if (!supabase) {
        return {
          ok: false,
          message:
            'Supabase is not configured — the portal is running in dev mode. Use "Continue to dashboard".',
        };
      }

      const callback = new URL(`${currentOrigin()}/auth/callback`);
      if (data.redirect?.startsWith("/")) {
        callback.searchParams.set("redirect", data.redirect);
      }
      const { data: res, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
          skipBrowserRedirect: true,
        },
      });
      if (error || !res.url) {
        return {
          ok: false,
          message: error?.message ?? "Google sign-in is not available right now.",
        };
      }
      return { ok: true, url: res.url };
    },
  );

/** Exchange the ?code= from the OAuth callback for a session cookie. */
export const exchangeAuthCode = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<SignInResult> => {
    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, message: "Supabase is not configured." };
    }
    const { error } = await supabase.auth.exchangeCodeForSession(data.code);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  });
