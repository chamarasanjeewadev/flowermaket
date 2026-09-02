/**
 * Auth server functions. All mutations return `ActionResult`-style unions so
 * pages can toast friendly messages instead of catching thrown errors.
 * Cookie writes go through the adapter in `session.ts`, so sign-in/out
 * genuinely emit Set-Cookie headers.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import {
  err,
  getEnv,
  ok,
  type ActionResult,
} from "@flowers/api";
import {
  resolveSessionUser,
  trySupabaseServer,
  type SessionUser,
} from "./session";

export type { SessionUser };

const AUTH_DISABLED_MESSAGE =
  "Accounts open once Supabase is connected — browsing works fully without an account.";

/** Map raw Supabase auth errors to short, human messages. */
function friendlyAuthMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("already registered") || m.includes("already exists")) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the confirmation link.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts — please wait a moment and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

/** Current site origin for OAuth redirects (env first, then the request). */
function currentOrigin(): string {
  const configured = getEnv().SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return getRequestUrl().origin;
}

/** Session for the whole route tree; fetched once in the root beforeLoad. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser> => resolveSessionUser(),
);

export const signInWithPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }): Promise<ActionResult<{ userId: string }>> => {
    const supabase = trySupabaseServer();
    if (!supabase) return err("db_unavailable", AUTH_DISABLED_MESSAGE);

    const { data: res, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error || !res.user) {
      return err(
        "validation",
        friendlyAuthMessage(error?.message ?? "Could not sign in."),
      );
    }
    return ok({ userId: res.user.id });
  });

export const signUpWithPassword = createServerFn({ method: "POST" })
  .validator(
    (data: { email: string; password: string; fullName: string }) => data,
  )
  .handler(
    async ({
      data,
    }): Promise<ActionResult<{ status: "signed_in" | "confirm_email" }>> => {
      const supabase = trySupabaseServer();
      if (!supabase) return err("db_unavailable", AUTH_DISABLED_MESSAGE);

      const { data: res, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: data.fullName } },
      });
      if (error) return err("validation", friendlyAuthMessage(error.message));

      // Supabase indicates "confirm your email" by returning a user with no
      // session (and, for existing users, an empty identities array).
      if (!res.session) return ok({ status: "confirm_email" as const });

      return ok({ status: "signed_in" as const });
    },
  );

export const signOut = createServerFn({ method: "POST" }).handler(
  async (): Promise<ActionResult<{ signedOut: true }>> => {
    const supabase = trySupabaseServer();
    if (!supabase) return err("db_unavailable", AUTH_DISABLED_MESSAGE);
    const { error } = await supabase.auth.signOut();
    if (error) return err("unknown", friendlyAuthMessage(error.message));
    return ok({ signedOut: true as const });
  },
);

/**
 * Build the Google OAuth URL server-side (PKCE verifier lands in a cookie via
 * the adapter); the client then does `window.location.assign(url)`.
 */
export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .validator((data: { redirect?: string }) => data)
  .handler(async ({ data }): Promise<ActionResult<{ url: string }>> => {
    const supabase = trySupabaseServer();
    if (!supabase) return err("db_unavailable", AUTH_DISABLED_MESSAGE);

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
      return err(
        "unknown",
        friendlyAuthMessage(
          error?.message ?? "Google sign-in is not available right now.",
        ),
      );
    }
    return ok({ url: res.url });
  });

/** Exchange the ?code= from the OAuth callback for a session cookie. */
export const exchangeAuthCode = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<ActionResult<{ done: true }>> => {
    const supabase = trySupabaseServer();
    if (!supabase) return err("db_unavailable", AUTH_DISABLED_MESSAGE);
    const { error } = await supabase.auth.exchangeCodeForSession(data.code);
    if (error) return err("validation", friendlyAuthMessage(error.message));
    return ok({ done: true as const });
  });
