"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, FileText, MapPin, X } from "lucide-react";
import { ApiError, getReport, mediaUrl, updateReport, type SapCategory, type SapReport } from "../lib/api/client";
import styles from "./report-detail.module.css";
import { useI18n } from "../lib/i18n/provider";


const statusLabels: Record<SapReport["status"], string> = {
  submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan",
  resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat",
};

export default function ReportDetail({ id, categories, onClose, onUpdated }: { id: string; categories: SapCategory[]; onClose: () => void; onUpdated: () => void }) {
  const { t, intlLocale } = useI18n();
  const [report, setReport] = useState<SapReport | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => { setPortalTarget(document.body); }, []);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    if (!portalTarget) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? []).filter((node) => node.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); return; }
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) { event.preventDefault(); focusable[0]?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [portalTarget]);

  useEffect(() => {
    const controller = new AbortController();
    void getReport(id, controller.signal).then(async value => {
      if (controller.signal.aborted) return;
      setReport(value); setDescription(value.description);
      const urls = await Promise.allSettled(value.mediaIds.map(mediaId => mediaUrl(mediaId, controller.signal)));
      if (!controller.signal.aborted) setPhotos(urls.filter(item => item.status === "fulfilled").map(item => item.value.url));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail laporan belum tersedia."); });
    return () => controller.abort();
  }, [id]);

  async function save() {
    if (!report || busy) return;
    if (description.trim().length < 20 || description.trim().length > 2000) { setError("Keterangan harus berisi 20–2000 karakter."); return; }
    setBusy(true); setError("");
    try { const next = await updateReport(report.id, report.revision, { description: description.trim() }); setReport(next); setEditing(false); onUpdated(); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const latest = await getReport(report.id);
        setReport(latest);
        setError("Laporan berubah di server. Periksa data terbaru sebelum menyimpan lagi.");
      } else setError(cause instanceof Error ? cause.message : "Perubahan belum tersimpan.");
    } finally { setBusy(false); }
  }

  if (!portalTarget) return null;

  return createPortal(<div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="report-detail-title">
      <div className={styles.heading}><div><span>{t("DETAIL LAPORAN")}</span><h2 id="report-detail-title">{t("Laporan saya")}</h2></div><button type="button" onClick={onClose} aria-label={t("Tutup detail laporan")}><X size={22} /></button></div>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {!report ? <p className={styles.loading}>{t("Memuat laporan…")}</p> : <>
        <div className={styles.status}>{t(statusLabels[report.status])} <small>{t("Revisi")}{" "}{report.revision}</small></div>
        {report.publicSummary && ["verified", "in_progress", "resolved"].includes(report.status) && <a className={styles.publicLink} href={`/incidents/${encodeURIComponent(report.id)}`}>{t("Buka kronologi publik dan kirim pembaruan warga")} ↗</a>}
        <div className={styles.facts}><span><CalendarDays size={18} />{new Date(report.occurredAt).toLocaleString(intlLocale)}</span><span><MapPin size={18} />{report.location.latitude.toFixed(5)}, {report.location.longitude.toFixed(5)}</span><span><FileText size={18} />{categories.find(item => item.id === report.categoryId)?.name || t("Tanpa kategori")} {" "}{t("· Tumpukan")}{" "}{report.reportedSeverity}</span></div>
        {photos.length > 0 && <div className={styles.photos}>{photos.map((url, index) => <img key={url} src={url} alt={t("Bukti laporan {0}", { "0": index + 1 })} />)}</div>}
        <div className={styles.description}><div><h3>{t("Keterangan")}</h3>{report.status === "submitted" && !editing && <button type="button" onClick={() => setEditing(true)}>{t("Ubah")}</button>}</div>{editing ? <><textarea value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} aria-label={t("Ubah keterangan laporan")} /><div className={styles.actions}><button type="button" onClick={() => { setEditing(false); setDescription(report.description); }}>{t("Batal")}</button><button type="button" onClick={save} disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan perubahan")}</button></div></> : <p>{report.description}</p>}</div>
        <div className={styles.timeline}><h3>{t("Riwayat status")}</h3>{report.timeline.map(event => <div key={event.id}><strong>{t(statusLabels[event.status])}</strong><time>{new Date(event.createdAt).toLocaleString(intlLocale)}</time>{event.note && <p>{event.note}</p>}</div>)}</div>
      </>}
    </section>
  </div>, document.body);
}
