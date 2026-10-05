import type { ImpactQuery } from "../../lib/api/impact";

export const numberLabel = (n: number, locale = "id-ID") => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
export const weightLabel = (n: number, locale = "id-ID") => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} kg`;
export const updatedLabel = (date: string, locale = "id-ID") => new Intl.DateTimeFormat(locale, {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
}).format(new Date(date)) + " WIB";

export function dayAt(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
export function todayJakarta(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).formatToParts(new Date());
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
export function periodLabel(start: string, end: string, locale = "id-ID"): string {
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  return format.formatRange(new Date(start + "T00:00:00+07:00"), new Date(end + "T00:00:00+07:00"));
}
export function queryForDays(start: string, end: string, cellId?: string): ImpactQuery {
  const startMs = Date.parse(start + "T00:00:00+07:00");
  const endMs = Date.parse(end + "T00:00:00+07:00");
  return {
    from: Number.isFinite(startMs) ? new Date(startMs).toISOString() : "",
    // API uses an exclusive upper boundary; the date picker is inclusive.
    to: Number.isFinite(endMs) ? new Date(endMs + 86_400_000).toISOString() : "",
    ...(cellId ? { cellId } : {}),
  };
}
