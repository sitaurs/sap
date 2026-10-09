"use client";

import { useRef } from "react";
import { Clock3, ExternalLink, FileText, ImageOff, RefreshCw, Search, X } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import { Notice } from "./publication-ui";
import { shortId } from "./publication-utils";
import PublicationHistory from "./publication-history";
import type { InstagramPost, PublicationSource } from "./types";
import ui from "./post-detail.module.css";

export default function PostPreviewPanel({ source, record, kind, url, altText, fallback, refreshing, canRefresh, canOpenReport, onRefresh, onReport, onImageError }: {
  source: PublicationSource; record: InstagramPost | null; kind: "initial" | "resolution"; url: string | null;
  altText: string; fallback: string; refreshing: boolean; canRefresh: boolean;
  canOpenReport: boolean; onRefresh: () => void; onReport: () => void; onImageError: () => void;
}) {
  const { t } = useI18n();
  const viewer = useRef<HTMLDialogElement>(null);
  return <section className={ui.previewColumn} aria-label={t("Pratinjau Instagram")}>
    <div className={ui.sectionHeading}>
      <h3>{t("Pratinjau Instagram")}</h3>
      <button type="button" className={ui.zoom} disabled={!url} onClick={() => viewer.current?.showModal()}><Search size={16} />{t("Perbesar")}</button>
    </div>
    <div className={ui.previewCanvas}>
      {url ? <img src={url} alt={altText} onError={onImageError} /> : <div className={ui.previewFallback}><ImageOff size={32} aria-hidden="true" /><Notice warning>{t(fallback)}</Notice></div>}
    </div>
    <button type="button" className={ui.outline} disabled={!canRefresh} onClick={onRefresh}><RefreshCw size={18} className={refreshing ? ui.spin : undefined} />{t("Perbarui versi dan preview")}</button>
    <div className={ui.sourceTags}>
      <span>{t("Laporan #")}{shortId(source.reportId)}</span><span>{source.categoryName}</span>
      <span>{t(kind === "resolution" ? "Hasil penanganan" : "Kejadian awal")} {t("· generasi")} {record?.generation ?? t("baru")}</span>
    </div>
    <button type="button" className={ui.sourceLink} disabled={!canOpenReport} onClick={onReport}>{t("Buka moderasi laporan")}<ExternalLink size={14} /></button>
    <div className={ui.metadata}>
      <div><Clock3 size={21} aria-hidden="true" /><div><span>{t("Masuk draf")}</span><DetailDate value={record?.createdAt ?? null} empty="Belum tersimpan" /></div></div>
      <div><FileText size={21} aria-hidden="true" /><div><span>{t("Pernah terposting")}</span><DetailDate value={record?.publishedAt ?? null} /></div></div>
    </div>
    {record?.retractedAt && <div className={ui.retracted}><span>{t("Ditarik")}</span><DetailDate value={record.retractedAt} /></div>}
    {record && <div className={ui.history}><PublicationHistory key={record.id} reportId={record.source.reportId} /></div>}
    {url && <dialog ref={viewer} className={ui.viewer} aria-label={t("Pratinjau Instagram diperbesar")} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) viewer.current?.close();
    }}>
      <button type="button" className={ui.viewerClose} onClick={() => viewer.current?.close()} aria-label={t("Tutup pratinjau")}><X size={23} /></button>
      <img src={url} alt={altText} onError={() => { viewer.current?.close(); onImageError(); }} />
    </dialog>}
  </section>;
}

function DetailDate({ value, empty = "Belum diposting" }: { value: string | null; empty?: string }) {
  const { t, intlLocale } = useI18n();
  if (!value || !Number.isFinite(Date.parse(value))) return <span>{t(empty)}</span>;
  const date = new Date(value);
  const day = new Intl.DateTimeFormat(intlLocale, { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(date);
  const clock = new Intl.DateTimeFormat(intlLocale, { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(".", ":");
  return <time dateTime={value}>{day}, {clock} WIB</time>;
}
