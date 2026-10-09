"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Info, Loader2, RefreshCw } from "lucide-react";
import { ApiError, decideReport, type SapReport } from "../../lib/api/client";
import { getReportPhotoUrl } from "../../lib/api/community";
import { useI18n } from "../../lib/i18n/provider";
import { DecisionDialogShell } from "./decision-dialog-shell";
import ui from "./decision-dialog.module.css";

type Outcome = { status: "saving" | "success" | "conflict" | "failed"; message: string };

function PrivatePhotos({ report }: { report: SapReport }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(""); setUrls([]);
    Promise.all(report.mediaIds.map(id => getReportPhotoUrl(report.id, id, controller.signal)))
      .then(items => { if (!controller.signal.aborted) setUrls(items.map(item => item.url)); })
      .catch(() => { if (!controller.signal.aborted) setError("Bukti laporan belum dapat dimuat."); });
    return () => controller.abort();
  }, [open, report.id, report.mediaIds, attempt]);
  return <details className={ui.sourceDetails} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("Bukti privat")}{" "}({report.mediaIds.length})</summary>
    {open && (error ? <div className={ui.error} role="alert">{t(error)}<button type="button" className={ui.textButton} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />{t("Muat ulang bukti")}</button></div>
      : report.mediaIds.length === 0 ? <p>{t("Laporan ini tidak memiliki foto bukti.")}</p>
      : urls.length === 0 ? <p role="status">{t("Memuat bukti laporan…")}</p>
      : <div className={ui.bulkPhotos}>{urls.map((url, index) => <img key={`${url}:${index}`} src={url} alt={t("Bukti laporan {0}", { "0": index + 1 })} onError={() => setError("Foto bukti belum dapat ditampilkan.")} />)}</div>)}
  </details>;
}

export function BulkVerifyModal({ reports, categoryName, onClose, onFinished }: {
  reports: SapReport[]; categoryName: (id: string | null) => string;
  onClose: () => void; onFinished: () => void;
}) {
  const { t, intlLocale } = useI18n();
  // Only retain an existing public summary. Private descriptions need human review.
  const [summaries, setSummaries] = useState<Record<string, string>>(() => Object.fromEntries(reports.map(report => [report.id, report.publicSummary ?? ""])));
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const submitted = useRef(false);
  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 1000;
  const readyCount = reports.filter(report => reviewed[report.id] && summaries[report.id].trim().length > 0 && summaries[report.id].trim().length <= 500).length;
  const canSubmit = reports.length > 0 && reports.every(report => report.status === "submitted") && reasonOk && readyCount === reports.length && confirmed && !busy && !finished;
  const successCount = Object.values(outcomes).filter(outcome => outcome.status === "success").length;

  function close() { if (busy) return; if (finished) onFinished(); else onClose(); }

  async function submit() {
    if (!canSubmit || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    for (const report of reports) {
      setOutcomes(current => ({ ...current, [report.id]: { status: "saving", message: "Menyimpan…" } }));
      try {
        await decideReport(report.id, report.revision, {
          nextStatus: "verified", reason: reason.trim(), publicSummary: summaries[report.id].trim(),
        });
        setOutcomes(current => ({ ...current, [report.id]: { status: "success", message: "Laporan terverifikasi." } }));
      } catch (cause) {
        const conflict = cause instanceof ApiError && cause.status === 409;
        setOutcomes(current => ({ ...current, [report.id]: {
          status: conflict ? "conflict" : "failed",
          message: conflict ? "Laporan sudah berubah. Muat ulang dan tinjau kembali." :
            cause instanceof ApiError && cause.message.trim() ? cause.message : "Hasil penyimpanan belum dapat dipastikan. Muat ulang laporan sebelum mencoba kembali.",
        } }));
      }
    }
    setBusy(false); setFinished(true);
  }

  return <DecisionDialogShell title="Verifikasi massal" description="Tinjau setiap laporan dan ringkasan publik."
    metadata={<span>{t("{0} laporan dipilih", { "0": reports.length })}</span>} pending={busy} onClose={close}
    footer={<>
      <div className={ui.requirements} role="status" id="bulk-requirements"><Info size={20} /><div>
        <p>{finished ? t("{0} dari {1} laporan terverifikasi.", { "0": successCount, "1": reports.length }) : t("{0} dari {1} laporan telah ditinjau.", { "0": readyCount, "1": reports.length })}</p>
        {!finished && <ul>
          {!reasonOk && <li>{t("Isi alasan keputusan sepanjang 5–1000 karakter.")}</li>}
          {readyCount < reports.length && <li>{t("Lengkapi ringkasan publik dan pemeriksaan setiap laporan.")}</li>}
          {!confirmed && <li>{t("Konfirmasikan verifikasi laporan yang dipilih.")}</li>}
        </ul>}
      </div></div>
      <div className={ui.actions}>
        {finished ? <button type="button" className={ui.save} onClick={close}><Check size={18} />{t("Selesai")}</button> : <>
          <button type="button" className={ui.outline} disabled={busy} onClick={close}>{t("Batal")}</button>
          <button type="button" className={ui.save} disabled={!canSubmit} aria-describedby="bulk-requirements" onClick={() => void submit()}>{busy ? <Loader2 size={18} className={ui.spin} /> : <Check size={18} />}{t("Verifikasi laporan")}</button>
        </>}
      </div>
    </>}>
    <div className={ui.bulkReview}>
      <aside className={ui.notice}><Info size={20} /><p>{t("Verifikasi laporan tidak otomatis mempublikasikan foto.")}</p></aside>
      {reports.map((report, index) => <section key={report.id} className={ui.bulkItem} aria-label={t("Laporan {0}", { "0": index + 1 })}>
        <div className={ui.sectionHeading}><h3>{index + 1}. {categoryName(report.categoryId)}</h3><span className={ui.fieldHint}>#{report.id.slice(0, 8)}</span></div>
        <p className={ui.bulkDescription}>{report.description || t("Tanpa deskripsi")}</p>
        <small className={ui.fieldHint}>{report.location.latitude.toFixed(4)}, {report.location.longitude.toFixed(4)} · {new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.occurredAt))}</small>
        <PrivatePhotos report={report} />
        <label className={ui.field}><span>{t("Ringkasan publik laporan {0}", { "0": index + 1 })}</span>
          <textarea aria-label={t("Ringkasan publik laporan {0}", { "0": index + 1 })} maxLength={500} required disabled={busy || finished} value={summaries[report.id]} onChange={event => { setSummaries(current => ({ ...current, [report.id]: event.target.value })); setReviewed(current => ({ ...current, [report.id]: false })); setConfirmed(false); }} />
          <small>{t("Gunakan informasi yang telah diperiksa; hindari data pribadi.")}</small>
        </label>
        <label className={ui.reviewCheck}><input type="checkbox" disabled={busy || finished} checked={Boolean(reviewed[report.id])} onChange={event => { setReviewed(current => ({ ...current, [report.id]: event.target.checked })); setConfirmed(false); }} />{t("Bukti dan ringkasan laporan {0} telah diperiksa.", { "0": index + 1 })}</label>
        {outcomes[report.id] && <p role="status" className={outcomes[report.id].status === "success" ? ui.success : outcomes[report.id].status === "saving" ? ui.fieldHint : ui.error}>{t(outcomes[report.id].message)}</p>}
      </section>)}
      <label className={ui.field}><span>{t("Alasan keputusan massal")}</span><textarea aria-label={t("Alasan keputusan massal")} minLength={5} maxLength={1000} required disabled={busy || finished} value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} /><small>{t("Alasan ini dicatat untuk setiap laporan.")}</small></label>
      <label className={ui.reviewCheck}><input type="checkbox" checked={confirmed} disabled={busy || finished || readyCount !== reports.length || !reasonOk} onChange={event => setConfirmed(event.target.checked)} />{t("Saya mengonfirmasi verifikasi semua laporan yang dipilih.")}</label>
    </div>
  </DecisionDialogShell>;
}
