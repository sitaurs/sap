import { english } from "./messages";
import type { Locale } from "./config";

export type TranslationValues = Record<string, string | number>;
export function translate(locale: Locale, source: string, values?: TranslationValues): string {
  const result = locale === "en" ? english[source] ?? source : source;
  return values ? result.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key])) : result;
}
