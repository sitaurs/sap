import type { SapReport } from "../../lib/api/client";
import type { PublicationSettings, PublicationSource } from "./types";

export function publicationDate(value: string, locale = "id-ID") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { day: "Waktu tidak tersedia", time: "" };
  return {
    day: new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(date),
    time: `${new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(".", ":")} WIB`,
  };
}
export function shortId(id: string) { return id.slice(0, 8); }
export function eligibleReport(report: SapReport) {
  return !!report.scanId && ["verified", "in_progress", "resolved"].includes(report.status)
    && !!report.publicSummary?.trim() && report.publishedMediaIds.length > 0;
}
export function buildCaption(source: PublicationSource, settings: PublicationSettings) {
  const text = settings.captionTemplate.replaceAll("{jenis_sampah}", source.categoryName)
    .replaceAll("{ringkasan_laporan}", source.publicSummary);
  return [text.trim(), settings.hashtags.trim()].filter(Boolean).join("\n\n").slice(0, 2200);
}
export function instagramPermalink(value: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["www.instagram.com", "instagram.com"].includes(url.hostname) && /^\/(p|reel)\//.test(url.pathname)) return url.href;
  } catch { /* Only known Instagram permalinks are exposed. */ }
}
