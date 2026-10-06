"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, FileText, LoaderCircle, Search } from "lucide-react";
import type { SapCategory } from "../../lib/api/client";
import { searchInstagramReportSources, type InstagramReportSourcePage } from "../../lib/api/instagram";
import PublicationPhoto from "./publication-photo";
import DialogShell from "./dialog-shell";
import { Busy, DateStamp, EmptyPublication, Notice } from "./publication-ui";
import { shortId } from "./publication-utils";
import type { PublicationSource } from "./types";
import styles from "./instagram.module.css";

type ReportSource = InstagramReportSourcePage["items"][number];

const SEARCH_DELAY_MS = 250;
const CATEGORY_LABELS: Record<string, string> = {
  battery: "Baterai", biological: "Sampah organik", cardboard: "Kardus", clothes: "Pakaian",
  glass: "Kaca", metal: "Logam", paper: "Kertas", plastic: "Plastik", shoes: "Sepatu", trash: "Sampah lainnya",
};

function toPublicationSource(report: ReportSource, mediaId: string, categoryName: string): PublicationSource {
  return {
    reportId: report.reportId,
    scanId: report.scanId,
    mediaId,
    categoryName,
    title: report.publicSummary.split("\n")[0]!.slice(0, 100),
    publicSummary: report.publicSummary,
  };
}

function mergeReports(current: ReportSource[], incoming: ReportSource[]) {
  return [...new Map([...current, ...incoming].map(report => [report.reportId, report])).values()];
}

function categoryLabel(value: string | null, categories: SapCategory[]) {
  if (!value) return "Belum dikategorikan";
  return categories.find(category => category.id === value)?.name ?? CATEGORY_LABELS[value] ?? value;
}

export default function ReportPicker({ categories, onChoose, onClose, onModeration }: {
  categories: SapCategory[]; onChoose: (source: PublicationSource) => void;
  onClose: () => void; onModeration: () => void;
}) {
  const [reports, setReports] = useState<ReportSource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (query: string, next?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const page = await searchInstagramReportSources(query, next, controller.signal);
      if (controller.signal.aborted) return;
      setReports(current => next ? mergeReports(current, page.items) : page.items);
      setCursor(page.nextCursor);
      setSubmittedSearch(query);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Laporan belum dapat dimuat.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(search.trim()); }, SEARCH_DELAY_MS);
    return () => { window.clearTimeout(timer); request.current?.abort(); };
  }, [load, search]);
  const categoryName = (value: string | null) => categoryLabel(value, categories);
  const searchPending = search.trim() !== submittedSearch;

  return <DialogShell wide title="Pilih laporan" subtitle="Cari semua laporan eligible dan pilih bukti foto yang disetujui." onClose={onClose}>
    <Notice><strong>Foto dan ringkasan yang aman untuk publik</strong><p>Hanya laporan terverifikasi dengan foto publik yang telah disetujui dapat dibuat menjadi postingan. Laporan tanpa scan juga disertakan.</p></Notice>
    <label className={styles.search}><Search size={19} aria-hidden="true" /><input type="search" aria-label="Cari ringkasan, kategori, tanggal, atau ID laporan" placeholder="Cari ringkasan, kategori, tanggal, atau ID laporan…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {loading && !reports.length ? <Busy>{searchPending ? "Mencari laporan eligible…" : "Memuat laporan…"}</Busy> : reports.length ? <div className={styles.sourceList}>
      {reports.map(report => <article className={styles.sourceCard} key={report.reportId}>
        <div className={styles.sourceHead}><FileText size={17} /><span>Laporan #{shortId(report.reportId)}{report.scanId ? ` · Scan #${shortId(report.scanId)}` : " · Laporan manual"}</span><span className={styles.sourceVerified}><CheckCircle2 size={14} />Disetujui</span></div>
        <h3>{report.publicSummary}</h3><div className={styles.sourceMeta}><span>{categoryName(report.categoryName)}</span><DateStamp value={report.occurredAt} /><span>{report.status === "in_progress" ? "Dalam penanganan" : report.status === "resolved" ? "Selesai" : "Terverifikasi"}</span></div>
        <div className={styles.sourcePhotos}>{report.mediaIds.map((mediaId, index) => <button className={styles.photoChoice} key={mediaId} type="button" onClick={() => onChoose(toPublicationSource(report, mediaId, categoryName(report.categoryName)))}>
          <PublicationPhoto mediaId={mediaId} reportId={report.reportId} alt={`Foto laporan ${index + 1}: ${report.publicSummary}`} className={styles.choicePhoto} />
          <span>Pilih foto {index + 1}<ChevronRight size={16} /></span>
        </button>)}</div>
      </article>)}
    </div> : !loading ? <EmptyPublication title={search.trim() ? "Laporan tidak ditemukan" : "Belum ada laporan yang siap"} action={!search.trim() && <button className={styles.secondary} type="button" onClick={onModeration}>Buka moderasi laporan<ArrowRight size={17} /></button>}>
      {search.trim() ? "Coba kata lain. Pencarian mencakup ringkasan, kategori, tanggal, dan ID laporan." : "Setujui ringkasan publik dan foto melalui Moderasi laporan terlebih dahulu."}
    </EmptyPublication> : null}
    {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load(search.trim(), cursor ?? undefined)}>Coba lagi</button></div>}
    {cursor && <button className={styles.loadMore} type="button" disabled={loading} onClick={() => void load(submittedSearch, cursor)}>{loading ? <LoaderCircle className={styles.spin} size={17} /> : null}Muat laporan berikutnya</button>}
    <p className={styles.helper}>{reports.length} laporan eligible dimuat. Draf tetap memvalidasi ulang status sumber dan bukti foto saat dibuat.</p>
  </DialogShell>;
}
