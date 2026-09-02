/**
 * i18n core: locale type, dictionaries, and pure helpers. Keep this module
 * free of server-only and React imports — it is used isomorphically.
 */
import { en, type Dict } from "./en";
import { si } from "./si";

export type { Dict };
export { en, si };

export const LOCALES = ["en", "si"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const DICTS: Record<Locale, Dict> = { en, si };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "si";
}

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}
