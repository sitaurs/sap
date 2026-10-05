"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultLocale, intlLocales, isLocale, LOCALE_COOKIE, LOCALE_STORAGE, type Locale } from "./config";
import { translate, type TranslationValues } from "./translate";

type Values = TranslationValues;
type I18nContextValue = { locale: Locale; intlLocale: string; t: (source: string, values?: Values) => string; setLocale: (locale: Locale) => boolean };
const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ initialLocale = defaultLocale, children }: { initialLocale?: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return false;
    updateLocale(next);
    let saved = false;
    try { localStorage.setItem(LOCALE_STORAGE, next); saved = true; } catch { /* The in-memory choice remains usable. */ }
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      saved = saved || document.cookie.split("; ").includes(`${LOCALE_COOKIE}=${next}`);
    } catch { /* Storage may be disabled by the browser. */ }
    return saved;
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    // The cookie supplies the SSR language; localStorage is a fallback when cookies are blocked.
    try {
      const cookieValue = document.cookie.split("; ").find(value => value.startsWith(`${LOCALE_COOKIE}=`))?.split("=")[1];
      if (!isLocale(cookieValue)) {
        const stored = localStorage.getItem(LOCALE_STORAGE);
        if (isLocale(stored)) updateLocale(stored);
      }
    } catch { /* The server language remains available without browser storage. */ }
    function sync(event: StorageEvent) {
      if (event.key === LOCALE_STORAGE && isLocale(event.newValue)) updateLocale(event.newValue);
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const value = useMemo(() => ({ locale, intlLocale: intlLocales[locale], setLocale, t: (source: string, values?: Values) => translate(locale, source, values) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n requires LocaleProvider");
  return context;
}

export function UiText({ source }: { source: string }) {
  const { t } = useI18n();
  return t(source);
}
