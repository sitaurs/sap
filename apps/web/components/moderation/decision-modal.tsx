"use client";

import { useEffect, useState } from "react";
import { Check, Circle, ImageOff, Info, Loader2, MessageSquare, RefreshCw, X } from "lucide-react";
import { ApiError, decideReport, getReportDuplicates, uploadMedia, type DecisionInput, type SapDuplicateCandidate, type SapReport, type SapReportStatus } from "../../lib/api/client";
import { approveReportEvidence, getReportLifecycle, getReportPhotoUrl, listReportEvidenceRenditions, requestReportEvidenceRendition, type ReportLifecycle } from "../../lib/api/community";
import { r1Error } from "../../lib/api/r1";
import { useI18n } from "../../lib/i18n/provider";
import admin from "../admin-panel.module.css";
import ui from "./decision-dialog.module.css";
import { DecisionDialogShell } from "./decision-dialog-shell";
import { ReportEvidenceCard, type ReviewPhoto } from "./report-evidence-card";
import { RequestEvidenceModal } from "./request-evidence-modal";
import { STATUS_LABEL, TRANSITIONS, VERIFIED_FAMILY } from "./report-status";

function fmt(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function evidenceErrorText(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.code === "EVIDENCE_INVALID") {
    return cause.message === "Permintaan tidak dapat diproses."
      ? "Bukti belum bisa disetujui. Pastikan pemilik foto sudah memberi izin kanal ini di Laporan saya, pilih versi bukti ready, lalu muat ulang jika laporan baru berubah."
      : cause.message;
  }
  return r1Error(cause) || fallback;
}

export function DecisionModal({ report, categoryName, onClose, onDecided }: {
  report: SapReport;
  categoryName: (id: string | null) => string;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { t, intlLocale } = useI18n();
  const options = TRANSITIONS[report.status] ?? [];
  const [next, setNext] = useState<SapReportStatus>(options[0] ?? report.status);
  const [reason, setReason] = useState("");
  const [publicSummary, setPublicSummary] = useState(report.publicSummary ?? "");
  const [duplicateOfId, setDuplicateOfId] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<SapDuplicateCandidate[] | null>(null);
  const [duplicateError, setDuplicateError] = useState("");
  const [duplicateAttempt, setDuplicateAttempt] = useState(0);
  const [resolutionIds, setResolutionIds] = useState<string[]>([]);
  const [reportRevision, setReportRevision] = useState(report.revision);
  const [mediaReview, setMediaReview] = useState<ReviewPhoto[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(report.mediaIds.length > 0);
  const [renditionChoice, setRenditionChoice] = useState<Record<string, string>>({});
  const [publicationAssets, setPublicationAssets] = useState<ReportLifecycle["publicationAssets"]>([]);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);

  const isInitialVerify = next === "verified" && !VERIFIED_FAMILY.includes(report.status);
  const needsDuplicate = next === "duplicate";
  const needsResolutionMedia = next === "resolved";
  const canPublish = VERIFIED_FAMILY.includes(next);
  const canSuggestDuplicates = options.includes("duplicate");

  useEffect(() => {
    if (!canSuggestDuplicates) return;
    const controller = new AbortController();
    setDuplicateError("");
    setDuplicates(null);
    getReportDuplicates(report.id, controller.signal)
      .then(page => {
        if (!controller.signal.aborted) setDuplicates(page.items.filter(candidate =>
          candidate.reportId !== report.id && VERIFIED_FAMILY.includes(candidate.status),
        ));
      })
      .catch(() => { if (!controller.signal.aborted) setDuplicateError("Saran duplikat belum dapat dimuat."); });
    return () => controller.abort();
  }, [canSuggestDuplicates, duplicateAttempt, report.id]);

  async function addResolutionMedia(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true); setError("");
    try {
      for (const file of Array.from(files).slice(0, 3 - resolutionIds.length)) {
        const media = await uploadMedia(file, "resolution");
        setResolutionIds(current => (current.includes(media.id) || current.length >= 3 ? current : [...current, media.id]));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unggah bukti penyelesaian gagal.");
    } finally { setUploading(false); }
  }

  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 1000;
  const summaryOk = publicSummary.trim().length > 0 && publicSummary.trim().length <= 500;
  const duplicateOk = Boolean(duplicates?.some(candidate => candidate.reportId === duplicateOfId));
  const requirements = [
    { label: "Alasan keputusan 5–1000 karakter", met: reasonOk },
    ...(isInitialVerify ? [{ label: "Ringkasan publik 1–500 karakter tanpa data pribadi", met: summaryOk }] : []),
    ...(needsDuplicate ? [{ label: "Laporan kanonis terverifikasi dipilih", met: duplicateOk }] : []),
    ...(needsResolutionMedia ? [{ label: "Minimal satu foto bukti penyelesaian", met: resolutionIds.length > 0 && !uploading }] : []),
  ];
  const saveBlockers = [
    ...(!reasonOk ? ["Isi alasan keputusan sepanjang 5–1000 karakter."] : []),
    ...(needsDuplicate && !duplicateOk ? ["Pilih laporan kanonis untuk keputusan duplikat."] : []),
    ...(isInitialVerify && !summaryOk ? ["Isi ringkasan publik untuk verifikasi awal."] : []),
    ...(needsResolutionMedia && !resolutionIds.length ? ["Unggah minimal satu foto bukti penyelesaian."] : []),
    ...(uploading ? ["Tunggu unggahan bukti penyelesaian selesai."] : []),
    ...(evidenceBusy ? ["Tunggu perubahan bukti publik selesai."] : []),
    ...(busy ? ["Keputusan sedang disimpan."] : []),
  ];
  const canSubmit = saveBlockers.length === 0;

  useEffect(() => {
    setReportRevision(report.revision);
    setPublicationAssets([]);
  }, [report.id, report.revision]);

  function applyLifecycle(lifecycle: ReportLifecycle) {
    setReportRevision(lifecycle.sourceRevision);
    setPublicationAssets(lifecycle.publicationAssets);
  }

  function approvedFor(mediaId: string, renditionId: string | undefined, channel: "web" | "instagram") {
    return Boolean(renditionId && publicationAssets.some(asset =>
      asset.mediaId === mediaId && asset.renditionId === renditionId && asset.channels.includes(channel),
    ));
  }

  useEffect(() => {
    if (report.mediaIds.length === 0) { setMediaReview([]); setLoadingEvidence(false); return; }
    const controller = new AbortController();
    setEvidenceError("");
    setLoadingEvidence(true);
    void Promise.all([
      getReportLifecycle(report.id, controller.signal),
      Promise.all(report.mediaIds.map(async (mediaId) => {
        const [photo, page] = await Promise.all([
          getReportPhotoUrl(report.id, mediaId, controller.signal),
          listReportEvidenceRenditions(mediaId, report.id, undefined, controller.signal),
        ]);
        return { mediaId, url: photo.url, renditions: page.items };
      })),
    ]).then(([lifecycle, items]) => {
      if (controller.signal.aborted) return;
      applyLifecycle(lifecycle);
      setMediaReview(items);
      setRenditionChoice((old) => {
        const nextChoice = { ...old };
        for (const item of items) {
          if (!item.renditions.some((rendition) => rendition.id === nextChoice[item.mediaId])) {
            nextChoice[item.mediaId] = item.renditions.find((rendition) => rendition.status === "ready")?.id ?? "";
          }
        }
        return nextChoice;
      });
    }).catch((cause) => {
      if (!controller.signal.aborted) setEvidenceError(evidenceErrorText(cause, "Bukti laporan belum dapat dimuat."));
    }).finally(() => { if (!controller.signal.aborted) setLoadingEvidence(false); });
    return () => controller.abort();
  }, [report.id, report.mediaIds]);

  async function refreshReportEvidence() {
    setEvidenceError("");
    try {
      const [lifecycle, items] = await Promise.all([
        getReportLifecycle(report.id),
        Promise.all(report.mediaIds.map(async (mediaId) => {
          const [photo, page] = await Promise.all([
            getReportPhotoUrl(report.id, mediaId),
            listReportEvidenceRenditions(mediaId, report.id),
          ]);
          return { mediaId, url: photo.url, renditions: page.items };
        })),
      ]);
      applyLifecycle(lifecycle);
      setMediaReview(items);
      setRenditionChoice((old) => {
        const nextChoice = { ...old };
        for (const item of items) {
          if (!item.renditions.some((rendition) => rendition.id === nextChoice[item.mediaId])) {
            nextChoice[item.mediaId] = item.renditions.find((rendition) => rendition.status === "ready")?.id ?? "";
          }
        }
        return nextChoice;
      });
    } catch (cause) {
      setEvidenceError(evidenceErrorText(cause, "Bukti laporan belum dapat dimuat."));
    }
  }

  async function renderReportEvidence(mediaId: string) {
    if (evidenceBusy) return;
    setEvidenceBusy(mediaId);
    setEvidenceError("");
    setEvidenceMessage("");
    try {
      await requestReportEvidenceRendition({ id: report.id, revision: reportRevision }, mediaId, crypto.randomUUID());
      setEvidenceMessage("Versi bukti sedang disiapkan. Muat ulang daftar bukti sebentar lagi.");
      await refreshReportEvidence();
    } catch (cause) {
      setEvidenceError(evidenceErrorText(cause, "Versi bukti belum dapat dibuat."));
    } finally { setEvidenceBusy(""); }
  }

  async function approveMedia(mediaId: string, channel: "web" | "instagram") {
    const renditionId = renditionChoice[mediaId];
    if (!renditionId || evidenceBusy) return;
    setEvidenceBusy(`${mediaId}:${channel}`);
    setEvidenceError("");
    setEvidenceMessage("");
    try {
      const lifecycle = await approveReportEvidence(
        { id: report.id, revision: reportRevision },
        mediaId,
        { channel, approved: true, renditionId, reason: "Disetujui moderator untuk publikasi bukti laporan." },
        crypto.randomUUID(),
      );
      applyLifecycle(lifecycle);
      setEvidenceMessage(channel === "web" ? "Foto disetujui untuk halaman publik SAP." : "Foto disetujui untuk Instagram SAP.");
      await refreshReportEvidence();
    } catch (cause) {
      setEvidenceError(evidenceErrorText(cause, "Persetujuan foto belum tersimpan. Pastikan pemilik foto sudah memberi izin kanal ini."));
    } finally { setEvidenceBusy(""); }
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setError("");
    const input: DecisionInput = { nextStatus: next, reason: reason.trim() };
    if (needsDuplicate && duplicateOfId) input.duplicateOfId = duplicateOfId;
    if (needsResolutionMedia) input.resolutionMediaIds = resolutionIds;
    if (canPublish && publicSummary.trim().length > 0) input.publicSummary = publicSummary.trim();
    try {
      await decideReport(report.id, reportRevision, input);
      onDecided();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError("Laporan sudah berubah sejak dimuat. Tutup dan muat ulang antrean.");
      else setError(cause instanceof Error ? cause.message : "Keputusan belum tersimpan.");
      setBusy(false);
    }
  }

  const pending = busy || uploading || Boolean(evidenceBusy);
  return <><DecisionDialogShell pending={pending || requestOpen} onClose={onClose}
    metadata={<><span>{t("Laporan #{0} · Revisi {1}", { "0": report.id.slice(0, 8), "1": reportRevision })}</span><span className={ui.status} data-status={report.status}>{t(STATUS_LABEL[report.status])}</span></>}
    footer={<>
      <div className={ui.requirements} id="decision-save-requirements" role="status"><Info size={21} /><div>
        <p>{t(canSubmit ? "Keputusan siap disimpan." : "Lengkapi informasi keputusan sebelum menyimpan.")}</p>
        {saveBlockers.length > 0 && <ul>{saveBlockers.map(message => <li key={message}>{t(message)}</li>)}</ul>}
      </div></div>
      <div className={ui.actions}>
        <button className={ui.outline} type="button" onClick={onClose} disabled={pending}>{t("Batal")}</button>
        <button className={ui.save} type="button" onClick={() => void submit()} disabled={!canSubmit} aria-describedby="decision-save-requirements">
          {busy ? <><Loader2 className={ui.spin} size={18} />{t("Menyimpan…")}</> : <><Check size={18} />{t("Simpan keputusan")}</>}
        </button>
      </div>
    </>}>
    <div className={ui.columns}>
      <section className={ui.evidenceColumn} aria-label={t("Bukti laporan")}>
        <div className={ui.sectionHeading}><h3>{t("Bukti laporan")}</h3><span className={ui.count}>{t("{0} foto", { "0": report.mediaIds.length })}</span></div>
        {loadingEvidence && <div className={ui.empty} role="status"><Loader2 className={ui.spin} size={28} />{t("Memuat bukti laporan…")}</div>}
        {!loadingEvidence && report.mediaIds.length === 0 && <div className={ui.empty}><ImageOff size={30} /><span>{t("Laporan ini tidak memiliki foto bukti.")}</span></div>}
        {mediaReview.map((item, index) => <ReportEvidenceCard key={item.mediaId} item={item} index={index} canPublish={canPublish}
          selected={renditionChoice[item.mediaId] ?? ""} pending={pending}
          webApproved={approvedFor(item.mediaId, renditionChoice[item.mediaId], "web")}
          instagramApproved={approvedFor(item.mediaId, renditionChoice[item.mediaId], "instagram")}
          onSelect={id => setRenditionChoice(old => ({ ...old, [item.mediaId]: id }))}
          onPrepare={() => void renderReportEvidence(item.mediaId)} onApprove={channel => void approveMedia(item.mediaId, channel)}
          onRefresh={() => void refreshReportEvidence()} />)}
        {evidenceMessage && <p className={ui.success} role="status">{t(evidenceMessage)}</p>}
        {evidenceError && <div className={ui.error} role="alert"><p>{t(evidenceError)}</p><button type="button" className={ui.textButton} onClick={() => void refreshReportEvidence()} disabled={pending}><RefreshCw size={15} />{t("Muat ulang bukti")}</button></div>}
        <details className={ui.sourceDetails}><summary>{t("Keterangan laporan")}</summary><strong>{t(categoryName(report.categoryId))}</strong><p>{report.description || t("Tanpa deskripsi")}</p><small>{fmt(report.occurredAt, intlLocale)}</small></details>
      </section>
      <section className={ui.decisionColumn} aria-label={t("Keputusan moderator")} aria-busy={busy}>
        <h3>{t("Keputusan moderator")}</h3>
        <label className={ui.field}><span>{t("Status baru")}</span>
          <select value={next} disabled={pending} onChange={event => setNext(event.target.value as SapReportStatus)} aria-label={t("Status baru")}>
            {options.map(value => <option key={value} value={value}>{t(STATUS_LABEL[value])}{value === report.status ? t(" (perbarui)") : ""}</option>)}
          </select>
        </label>
        {canSuggestDuplicates && <section className={ui.field} aria-label={t("Saran duplikat")}>
          <span>{t(needsDuplicate ? "Duplikat dari" : "Saran duplikat")}</span><small>{t("Kandidat dalam radius 100 m dan 24 jam: Terverifikasi, Dalam penanganan, atau Selesai.")}</small>
          {duplicateError ? <div className={ui.error} role="alert"><p>{t(duplicateError)}</p><button type="button" className={ui.textButton} disabled={pending} onClick={() => setDuplicateAttempt(value => value + 1)}><RefreshCw size={15} />{t("Muat ulang kandidat")}</button></div>
            : duplicates === null ? <div className={ui.loading}><Loader2 className={ui.spin} size={18} />{t("Memuat kandidat…")}</div>
            : duplicates.length === 0 ? <p className={ui.fieldHint}>{t("Tidak ada kandidat duplikat yang cocok.")}</p>
            : <div className={admin.dupList}>{duplicates.map(candidate => <button key={candidate.reportId} type="button" className={admin.dupRow} data-active={needsDuplicate && duplicateOfId === candidate.reportId} aria-pressed={needsDuplicate && duplicateOfId === candidate.reportId} disabled={pending} onClick={() => { setDuplicateOfId(candidate.reportId); setNext("duplicate"); }}>
              <span className={ui.status} data-status={candidate.status}>{t(STATUS_LABEL[candidate.status])}</span><span>{Math.round(candidate.distanceMeters)} m · {fmt(candidate.occurredAt, intlLocale)}</span><span className={admin.rev}>{candidate.reportId.slice(0, 8)}</span>
            </button>)}</div>}
        </section>}
        {canPublish && <label className={ui.field}><span>{t("Ringkasan publik")}{!isInitialVerify && <small>{" "}{t("(opsional)")}</small>}</span>
          <textarea value={publicSummary} maxLength={500} disabled={busy} onChange={event => setPublicSummary(event.target.value)} placeholder={t("Tulis ringkasan yang akan tampil ke publik…")} aria-label={t("Ringkasan publik")} aria-describedby="decision-summary-help" required={isInitialVerify} />
          <span id="decision-summary-help" className={ui.fieldHint}>{t("Gunakan informasi yang telah diperiksa; hindari data pribadi.")}</span>
        </label>}
        {needsResolutionMedia && <div className={ui.field}>
          <span>{t("Bukti penyelesaian")}{" "}<small>{t("(wajib, maks 3 foto)")}</small></span>
          <input className={ui.upload} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={pending || resolutionIds.length >= 3} onChange={event => { void addResolutionMedia(event.target.files); event.target.value = ""; }} aria-label={t("Unggah bukti penyelesaian")} />
          {uploading && <small><Loader2 className={ui.spin} size={14} />{t("Mengunggah…")}</small>}
          {resolutionIds.length > 0 && <div className={admin.checkRow}>{resolutionIds.map((id, index) => <span key={id} className={admin.checkChip} data-active="true"><Check size={14} />{t("Bukti")}{" "}{index + 1}<button type="button" disabled={pending} className={ui.removeEvidence} onClick={() => setResolutionIds(current => current.filter(value => value !== id))} aria-label={t("Hapus bukti {0}", { "0": index + 1 })}><X size={13} /></button></span>)}</div>}
        </div>}
        <label className={ui.field}><span>{t("Alasan keputusan")}</span>
          <textarea value={reason} maxLength={1000} required minLength={5} disabled={busy} onChange={event => setReason(event.target.value)} placeholder={t("Tulis alasan keputusan untuk jejak audit…")} aria-label={t("Alasan keputusan")} aria-describedby="decision-reason-help" />
          <span className={ui.fieldMeta}><span id="decision-reason-help">{t("Wajib diisi · minimal 5 karakter.")}</span><span>{reason.length}/1000</span></span>
        </label>
        <section className={ui.checklist} aria-label={t("Prasyarat keputusan")} aria-live="polite">
          <h4>{t("Prasyarat keputusan")}</h4>
          <ul>{requirements.map(item => <li key={item.label} data-met={item.met}>
            {item.met ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
            <span>{t(item.label)}</span><small>{t(item.met ? "Terpenuhi" : "Belum terpenuhi")}</small>
          </li>)}</ul>
        </section>
        <aside className={ui.notice}><Info size={20} /><p>{t("Verifikasi laporan tidak otomatis mempublikasikan foto.")}</p></aside>
        {report.status === "submitted" && <button type="button" className={ui.outline} disabled={pending} onClick={() => setRequestOpen(true)}><MessageSquare size={18} />{t("Minta klarifikasi/bukti")}</button>}
        {error && <p className={ui.error} role="alert">{t(error)}</p>}
      </section>
    </div>
  </DecisionDialogShell>
  {requestOpen && <RequestEvidenceModal report={report} onClose={() => setRequestOpen(false)} />}
  </>;
}
