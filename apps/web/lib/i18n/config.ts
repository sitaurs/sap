export const LOCALE_COOKIE = "sap_locale";
export const LOCALE_STORAGE = "sap.locale.v1";
export type Locale = "id" | "en";
export const defaultLocale: Locale = "en";
export const intlLocales: Record<Locale, string> = { id: "id-ID", en: "en-GB" };
export function isLocale(value: unknown): value is Locale { return value === "id" || value === "en"; }
