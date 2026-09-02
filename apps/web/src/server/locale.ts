/** Locale cookie server functions — read in the root beforeLoad, written by
 * the header language switcher. The cookie is plain (not httpOnly-sensitive)
 * so SSR and client agree on the active language. */
import { createServerFn } from "@tanstack/react-start";
import { getCookies, setCookie, getRequestHeader } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n";

const COOKIE_NAME = "locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const getLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Locale> => {
    const raw = getCookies()[COOKIE_NAME];
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  },
);

export const setLocale = createServerFn({ method: "POST" })
  .validator((locale: unknown): Locale =>
    isLocale(locale) ? locale : DEFAULT_LOCALE,
  )
  .handler(async ({ data }): Promise<Locale> => {
    setCookie(COOKIE_NAME, data, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
    });
    return data;
  });

/**
 * Detect preferred locale from cookie → Accept-Language → default.
 * Used by the `/` redirect route.
 */
export const detectLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Locale> => {
    // 1. Cookie
    const cookieLocale = getCookies()[COOKIE_NAME];
    if (isLocale(cookieLocale)) return cookieLocale;

    // 2. Accept-Language header
    const acceptLanguage = getRequestHeader("accept-language") ?? "";
    const tags = acceptLanguage
      .split(",")
      .map((s) => s.trim().split(";")[0]?.trim().toLowerCase() ?? "")
      .filter(Boolean);

    for (const tag of tags) {
      if (tag.startsWith("si")) return "si";
      if (tag.startsWith("en")) return "en";
    }

    // 3. Default
    return DEFAULT_LOCALE;
  },
);
