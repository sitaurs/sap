"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, FileText, MapPin, X } from "lucide-react";
import { ApiError, getReport, mediaUrl, updateReport, type SapCategory, type SapReport } from "../lib/api/client";
import { getConsents, setConsents } from "../lib/api/community";
import type { R1 } from "../lib/api/r1";
import styles from "./report-detail.module.css";
import { useI18n } from "../lib/i18n/provider";


const statusLabels: Record<SapReport["status"], string> = {
  submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan",
  resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat",
};
const severityLabels: Record<SapReport["reportedSeverity"], string> = { small: "Kecil", medium: "Sedang", large: "Besar" };
type PhotoConsent = {
  mediaId: string;
  url: string;
  urlRetries: number;
  refreshingUrl: boolean;
  photoError: string;
  channels: R1["MediaConsents"]["channels"];
  revision: number | null;
  saving: boolean;
  error: string;
};

export default function ReportDetail({ id, categories, onClose, onUpdated }: { id: string; categories: SapCategory[]; onClose: () => void; onUpdated: () => void }) {
  const { t, intlLocale } = useI18n();
  const [report, setReport] = useState<SapReport | null>(null);
  const [photos, setPhotos] = useState<PhotoConsent[]>([]);
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
      const urls = await Promise.allSettled(value.mediaIds.map(async mediaId => {
        const url = await mediaUrl(mediaId, controller.signal);
        const consent = await getConsents(mediaId, controller.signal).catch(() => null);
        return {
          mediaId,
          url: url.url,
          urlRetries: 0,
          refreshingUrl: false,
          photoError: "",
          channels: consent?.channels ?? [],
          revision: consent?.revision ?? null,
          saving: false,
          error: consent ? "" : "Izin foto belum dapat dimuat.",
        };
      }));
      if (!controller.signal.aborted) setPhotos(urls.filter(item => item.status === "fulfilled").map(item => item.value));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail laporan belum tersedia."); });
    return () => controller.abort();
  }, [id]);

  async function refreshPhotoUrl(mediaId: string) {
    const photo = photos.find(item => item.mediaId === mediaId);
    if (!photo || photo.refreshingUrl || photo.urlRetries >= 2) {
      if (photo && photo.urlRetries >= 2) {
        setPhotos(current => current.map(item => item.mediaId === mediaId
          ? { ...item, photoError: "Foto belum dapat dimuat. Tutup lalu buka kembali detail laporan." }
          : item));
      }
      return;
    }
    setPhotos(current => current.map(item => item.mediaId === mediaId
      ? { ...item, refreshingUrl: true, urlRetries: item.urlRetries + 1, photoError: "" }
      : item));
    try {
      const signed = await mediaUrl(mediaId);
      setPhotos(current => current.map(item => item.mediaId === mediaId
        ? { ...item, url: signed.url, refreshingUrl: false }
        : item));
    } catch {
      setPhotos(current => current.map(item => item.mediaId === mediaId
        ? { ...item, refreshingUrl: false, photoError: "Foto belum dapat dimuat. Tutup lalu buka kembali detail laporan." }
        : item));
    }
  }

  function photoLoaded(mediaId: string) {
    setPhotos(current => current.map(item => item.mediaId === mediaId
      ? { ...item, urlRetries: 0, photoError: "" }
      : item));
  }

  async function toggleConsent(mediaId: string, channel: "web" | "instagram", enabled: boolean) {
    const photo = photos.find(item => item.mediaId === mediaId);
    if (!photo || photo.revision === null || photo.saving) return;
    const nextChannels = enabled
      ? [...photo.channels, channel].filter((value, index, list) => list.indexOf(value) === index)
      : photo.channels.filter(item => item !== channel);
    setPhotos(current => current.map(item => item.mediaId === mediaId ? { ...item, saving: true, error: "" } : item));
    try {
      const updated = await setConsents(mediaId, photo.revision, nextChannels);
      setPhotos(current => current.map(item => item.mediaId === mediaId
        ? { ...item, channels: updated.channels, revision: updated.revision, saving: false, error: "" }
        : item));
    } catch (cause) {
      setPhotos(current => current.map(item => item.mediaId === mediaId
        ? { ...item, saving: false, error: cause instanceof Error ? cause.message : "Izin foto belum tersimpan." }
        : item));
    }
  }

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
    <section data-motion="dialog" ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="report-detail-title">
      <div className={styles.heading}><div><span>{t("DETAIL LAPORAN")}</span><h2 id="report-detail-title">{t("Laporan saya")}</h2></div><button type="button" onClick={onClose} aria-label={t("Tutup detail laporan")}><X size={22} /></button></div>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {!report ? <p className={styles.loading}>{t("Memuat laporan…")}</p> : <>
        <div className={styles.status}>{t(statusLabels[report.status])} <small>{t("Revisi")}{" "}{report.revision}</small></div>
        {report.publicSummary && ["verified", "in_progress", "resolved"].includes(report.status) && <a className={styles.publicLink} href={`/incidents/${encodeURIComponent(report.id)}`}>{t("Buka kronologi publik dan kirim pembaruan warga")} ↗</a>}
        <div className={styles.facts}><span><CalendarDays size={18} />{new Date(report.occurredAt).toLocaleString(intlLocale)}</span><span><MapPin size={18} />{report.location.latitude.toFixed(5)}, {report.location.longitude.toFixed(5)}</span><span><FileText size={18} />{t(categories.find(item => item.id === report.categoryId)?.name || "Tanpa kategori")}{" "}{t("· Tumpukan")}{" "}{t(severityLabels[report.reportedSeverity])}</span></div>
        {photos.length > 0 && <div className={styles.photos}>{photos.map((photo, index) => <figure key={photo.mediaId} className={styles.photoConsent}>
          <img src={photo.url} alt={t("Bukti laporan {0}", { "0": index + 1 })} onLoad={() => photoLoaded(photo.mediaId)} onError={() => void refreshPhotoUrl(photo.mediaId)} />
          {photo.refreshingUrl && <small role="status">{t("Memuat ulang foto…")}</small>}
          {photo.photoError && <small role="alert">{t(photo.photoError)}</small>}
          <figcaption>
            <strong>{t("Izin foto")}{" "}{index + 1}</strong>
            {(["web", "instagram"] as const).map(channel => <label key={channel}>
              <input
                type="checkbox"
                checked={photo.channels.includes(channel)}
                disabled={photo.saving || photo.revision === null}
                onChange={event => void toggleConsent(photo.mediaId, channel, event.target.checked)}
              />
              {channel === "web" ? t("Publik SAP") : "Instagram SAP"}
            </label>)}
            {photo.saving && <small>{t("Menyimpan izin…")}</small>}
            {photo.error && <small className={styles.consentError}>{t(photo.error)}</small>}
          </figcaption>
        </figure>)}</div>}
        <div className={styles.description}><div><h3>{t("Keterangan")}</h3>{report.status === "submitted" && !editing && <button type="button" onClick={() => setEditing(true)}>{t("Ubah")}</button>}</div>{editing ? <><textarea value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} aria-label={t("Ubah keterangan laporan")} /><div className={styles.actions}><button type="button" onClick={() => { setEditing(false); setDescription(report.description); }}>{t("Batal")}</button><button type="button" onClick={save} disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan perubahan")}</button></div></> : <p>{report.description}</p>}</div>
        <div className={styles.timeline}><h3>{t("Riwayat status")}</h3>{report.timeline.map(event => <div key={event.id}><strong>{t(statusLabels[event.status])}</strong><time>{new Date(event.createdAt).toLocaleString(intlLocale)}</time>{event.note && <p>{event.note}</p>}</div>)}</div>
      </>}
    </section>
  </div>, document.body);
}
