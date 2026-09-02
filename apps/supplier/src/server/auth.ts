/**
 * Auth server functions for the Supplier Portal.
 */
import { createServerFn } from "@tanstack/react-start";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { isLocale, type Locale, DEFAULT_LOCALE } from "../i18n";
import { getSupabase, resolveSupplierSession, type SupplierSession } from "./session";

export type { SupplierSession };

export interface SignInResult {
  ok: boolean;
  message?: string;
}

export const getSupplierSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupplierSession> => resolveSupplierSession(),
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

// ---------------------------------------------------------------------------
// Locale cookie helpers (cookie-based toggle, no path prefixes)
// ---------------------------------------------------------------------------

const LOCALE_COOKIE = "locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const getLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Locale> => {
    const raw = getCookies()[LOCALE_COOKIE];
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  },
);

export const setLocale = createServerFn({ method: "POST" })
  .validator((locale: unknown): Locale =>
    isLocale(locale) ? locale : DEFAULT_LOCALE,
  )
  .handler(async ({ data }): Promise<Locale> => {
    setCookie(LOCALE_COOKIE, data, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
    });
    return data;
  });
