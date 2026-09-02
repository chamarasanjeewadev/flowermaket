/** Tiny React context that exposes the active dictionary + locale. */
import * as React from "react";
import { DEFAULT_LOCALE, en, getDict, type Dict, type Locale } from "./index";

interface I18nValue {
  /** Active dictionary — `t.section.key`. */
  t: Dict;
  locale: Locale;
}

const I18nContext = React.createContext<I18nValue>({
  t: en,
  locale: DEFAULT_LOCALE,
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = React.useMemo<I18nValue>(
    () => ({ t: getDict(locale), locale }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  return React.useContext(I18nContext);
}
