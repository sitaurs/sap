"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, FileText, LoaderCircle, Search } from "lucide-react";
import { listAdminReports, type SapCategory, type SapReport } from "../../lib/api/client";
import PublicationPhoto from "./publication-photo";
import DialogShell from "./dialog-shell";
import { Busy, DateStamp, EmptyPublication, Notice } from "./publication-ui";
import { eligibleReport, shortId } from "./publication-utils";
import type { PublicationSource } from "./types";
import styles from "./instagram.module.css";

export default function ReportPicker({ categories, onChoose, onClose, onModeration }: {
  categories: SapCategory[]; onChoose: (source: PublicationSource) => void;
  onClose: () => void; onModeration: () => void;
}) {
  const [reports, setReports] = useState<SapReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try {
      const page = await listAdminReports(undefined, next, controller.signal);
      if (controller.signal.aborted) return;
      setReports(current => next ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.nextCursor ?? null);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Laporan belum dapat dimuat."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  const eligible = reports.filter(eligibleReport);
  const visible = eligible.filter(report => `${report.publicSummary} ${report.id} ${report.scanId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const categoryName = (id: SapReport["categoryId"]) => categories.find(item => item.id === id)?.name || "Sampah lainnya";
  return <DialogShell wide title="Pilih laporan" subtitle="Gunakan foto laporan dari scan yang sudah disetujui." onClose={onClose}>
    <Notice><strong>Foto dan ringkasan yang aman untuk publik</strong><p>Hanya laporan terverifikasi dengan foto publik yang telah disetujui dapat dibuat menjadi postingan.</p></Notice>
    <label className={styles.search}><Search size={19} aria-hidden="true" /><input type="search" aria-label="Cari laporan yang dimuat" placeholder="Cari ringkasan atau ID laporan…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {loading && !reports.length ? <Busy>Memuat laporan…</Busy> : visible.length ? <div className={styles.sourceList}>
      {visible.map(report => <article className={styles.sourceCard} key={report.id}>
        <div className={styles.sourceHead}><FileText size={17} /><span>Laporan #{shortId(report.id)} · Scan #{shortId(report.scanId!)}</span><span className={styles.sourceVerified}><CheckCircle2 size={14} />Disetujui</span></div>
        <h3>{report.publicSummary}</h3><div className={styles.sourceMeta}><span>{categoryName(report.categoryId)}</span><DateStamp value={report.createdAt} /></div>
        <div className={styles.sourcePhotos}>{report.publishedMediaIds.map((mediaId, index) => <button className={styles.photoChoice} key={mediaId} type="button" onClick={() => onChoose({ reportId: report.id, scanId: report.scanId, mediaId, categoryName: categoryName(report.categoryId), title: report.publicSummary!.split("\n")[0].slice(0, 100), publicSummary: report.publicSummary! })}>
          <PublicationPhoto mediaId={mediaId} reportId={report.id} alt={`Foto laporan ${index + 1}: ${report.publicSummary}`} className={styles.choicePhoto} />
          <span>Pilih foto {index + 1}<ChevronRight size={16} /></span>
        </button>)}</div>
      </article>)}
    </div> : <EmptyPublication title={search ? "Laporan tidak ditemukan" : "Belum ada laporan yang siap"} action={!search && <button className={styles.secondary} type="button" onClick={onModeration}>Buka moderasi laporan<ArrowRight size={17} /></button>}>
      {search ? "Coba kata lain atau muat laporan berikutnya." : "Setujui laporan dari scan, ringkasan publik, dan foto melalui Moderasi laporan terlebih dahulu."}
    </EmptyPublication>}
    {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load(cursor || undefined)}>Coba lagi</button></div>}
    {cursor && <button className={styles.loadMore} type="button" disabled={loading} onClick={() => void load(cursor)}>{loading ? <LoaderCircle className={styles.spin} size={17} /> : null}Muat laporan berikutnya</button>}
    <p className={styles.helper}>{eligible.length} laporan siap dari {reports.length} laporan yang dimuat. Foto privat tidak otomatis dipublikasikan.</p>
  </DialogShell>;
}
