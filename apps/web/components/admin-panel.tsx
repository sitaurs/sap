"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ClipboardList, Cpu, FileClock, Loader2, MapPin, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import styles from "./dashboard.module.css";
import admin from "./admin-panel.module.css";
import {
  ApiError, decideReport, getReport, getAdminStats, getReportDuplicates, getScanSettings, listAdminReports,
  listAuditEvents, updateScanSettings, uploadMedia,
  type DecisionInput, type SapAdminStats, type SapAuditEvent, type SapCategory,
  type SapDuplicateCandidate, type SapReport, type SapReportStatus, type SapScanSettings,
} from "../lib/api/client";
import {
  approveReportEvidence,
  getReportLifecycle,
  getReportPhotoUrl,
  listReportEvidenceRenditions,
  requestReportEvidenceRendition,
  type EvidenceRendition,
  type ReportLifecycle,
} from "../lib/api/community";
import { r1Error } from "../lib/api/r1";
import { useI18n } from "../lib/i18n/provider";


const STATUS_LABEL: Record<SapReportStatus, string> = {
  submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan",
  resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat",
};
const STATUS_COLOR: Record<SapReportStatus, string> = {
  submitted: "#f4b532", verified: "#3473c8", in_progress: "#63b2eb",
  resolved: "#4b9e54", rejected: "#ef6967", duplicate: "#9aa5b2",
};
// Mirrors the server-side transition table (moderation.types.ts). The API is the
// source of truth; this only trims the UI to plausible choices before submit.
const VERIFIED_FAMILY: SapReportStatus[] = ["verified", "in_progress", "resolved"];
const TRANSITIONS: Record<SapReportStatus, SapReportStatus[]> = {
  submitted: ["verified", "rejected", "duplicate"],
  verified: ["verified", "in_progress", "rejected", "duplicate"],
  in_progress: ["in_progress", "resolved", "verified", "rejected", "duplicate"],
  resolved: ["resolved", "verified", "rejected", "duplicate"],
  rejected: ["submitted"],
  duplicate: ["submitted"],
};

const MODE_INFO: Record<SapScanSettings["mode"], { label: string; hint: string }> = {
  full_ml: { label: "ML saja", hint: "Selalu pakai model ML lokal; tidak pernah ke vision LLM." },
  unknown_only: { label: "LLM untuk tak dikenali", hint: "Eskalasi ke vision LLM hanya saat ML tidak mengenali." },
  unknown_plus_threshold: { label: "Tak dikenali + ambang", hint: "Eskalasi saat tidak dikenali atau keyakinan di bawah ambang." },
  full_llm: { label: "LLM saja", hint: "Selalu pakai vision LLM (fallback ke ML bila gagal)." },
};

function fmt(value: string, locale = "id-ID") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function StatusBadge({ status }: { status: SapReportStatus }) {
  const { t } = useI18n();
  return <span className={admin.badge} style={{ background: STATUS_COLOR[status] }}>{t(STATUS_LABEL[status])}</span>;
}

function evidenceErrorText(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.code === "EVIDENCE_INVALID") {
    return cause.message === "Permintaan tidak dapat diproses."
      ? "Bukti belum bisa disetujui. Pastikan pemilik foto sudah memberi izin kanal ini di Laporan saya, pilih versi bukti ready, lalu muat ulang jika laporan baru berubah."
      : cause.message;
  }
  return r1Error(cause) || fallback;
}

export default function AdminPanel({ section, categories }: { section: "moderation" | "settings"; categories: SapCategory[] }) {
  if (section === "settings") return <ScanSettingsPanel />;
  return <ModerationPanel categories={categories} />;
}

// --- Scan settings ---------------------------------------------------------

function ScanSettingsPanel() {
  const { t, intlLocale } = useI18n();
  const [settings, setSettings] = useState<SapScanSettings | null>(null);
  const [draft, setDraft] = useState<SapScanSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getScanSettings(controller.signal)
      .then(value => { setSettings(value); setDraft(value); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Pengaturan belum dapat dimuat."); });
    return () => controller.abort();
  }, []);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return settings.mode !== draft.mode || settings.confidenceThreshold !== draft.confidenceThreshold
      || settings.visionEnabled !== draft.visionEnabled || settings.visionModel !== draft.visionModel;
  }, [settings, draft]);

  function patch(next: Partial<SapScanSettings>) {
    setSaved(false); setError("");
    setDraft(current => current && { ...current, ...next });
  }

  async function save() {
    if (!draft || !settings || saving) return;
    setSaving(true); setError(""); setSaved(false);
    const body = {
      ...(draft.mode !== settings.mode ? { mode: draft.mode } : {}),
      ...(draft.confidenceThreshold !== settings.confidenceThreshold ? { confidenceThreshold: draft.confidenceThreshold } : {}),
      ...(draft.visionEnabled !== settings.visionEnabled ? { visionEnabled: draft.visionEnabled } : {}),
      ...(draft.visionModel !== settings.visionModel ? { visionModel: draft.visionModel } : {}),
    };
    try {
      const updated = await updateScanSettings(body);
      setSettings(updated); setDraft(updated); setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Pengaturan belum tersimpan.");
    } finally { setSaving(false); }
  }

  if (loadError) return <div className={admin.empty} role="alert">{t(loadError)}</div>;
  if (!draft || !settings) return <div className={admin.empty} role="status"><Loader2 className={admin.spin} size={22} /> {" "}{t("Memuat pengaturan…")}</div>;

  const modelTrimmed = draft.visionModel.trim();
  const modelInvalid = modelTrimmed.length < 1 || modelTrimmed.length > 100;

  return <div className={admin.wrap}>
    <section className={admin.panel}>
      <div className={admin.panelHead}><Cpu size={22} /><h2>{t("Strategi deteksi")}</h2></div>
      <div className={admin.modeGrid}>
        {(Object.keys(MODE_INFO) as SapScanSettings["mode"][]).map(mode => (
          <button key={mode} type="button" className={admin.modeCard} data-active={draft.mode === mode} onClick={() => patch({ mode })} aria-pressed={draft.mode === mode}>
            <strong>{t(MODE_INFO[mode].label)}</strong>
            <small>{t(MODE_INFO[mode].hint)}</small>
          </button>
        ))}
      </div>
      <label className={admin.field}>
        <span>{t("Ambang keyakinan")}{" "}<small>{t("hasil ML di bawah nilai ini dieskalasi (mode “Tak dikenali + ambang”).")}</small></span>
        <div className={admin.sliderRow}>
          <input type="range" min={0} max={1} step={0.01} value={draft.confidenceThreshold}
            onChange={event => patch({ confidenceThreshold: Number(event.target.value) })}
            aria-label={t("Ambang keyakinan")} />
          <output>{draft.confidenceThreshold.toFixed(2)}</output>
        </div>
      </label>
    </section>

    <section className={admin.panel}>
      <div className={admin.panelHead}><ShieldCheck size={22} /><h2>Vision LLM</h2></div>
      <div className={admin.switchRow}>
        <div><strong>{t("Aktifkan vision LLM")}</strong><small>{t("Wajib untuk mode yang mengeskalasi ke LLM. Perlu gateway SAPA terkonfigurasi.")}</small></div>
        <button type="button" role="switch" aria-checked={draft.visionEnabled} aria-label={t("Aktifkan vision LLM")}
          className={`${styles.toggle} ${draft.visionEnabled ? styles.toggleOn : ""}`}
          onClick={() => patch({ visionEnabled: !draft.visionEnabled })}><span /></button>
      </div>
      <label className={admin.field}>
        <span>{t("Model vision")}</span>
        <input type="text" value={draft.visionModel} maxLength={100}
          onChange={event => patch({ visionModel: event.target.value })} aria-label={t("Model vision")} />
        {modelInvalid && <small style={{ color: "#c0392b" }}>{t("Nama model harus 1–100 karakter.")}</small>}
      </label>
    </section>

    <div className={admin.toolbar}>
      <button className={styles.primaryButton} type="button" onClick={save} disabled={!dirty || saving || modelInvalid}>
        {saving ? <><Loader2 className={admin.spin} size={18} />{t("Menyimpan…")}</> : <><Check size={18} />{t("Simpan pengaturan")}</>}
      </button>
      <span className={admin.rev}>{t("Terakhir diperbarui")}{" "}{fmt(settings.updatedAt, intlLocale)}</span>
      {error && <p className={admin.formError} role="alert">{t(error)}</p>}
      {saved && <p className={admin.formOk} role="status">{t("Pengaturan tersimpan.")}</p>}
    </div>
  </div>;
}

// --- Moderation ------------------------------------------------------------

const FILTERS: SapReportStatus[] = ["submitted", "verified", "in_progress", "resolved", "rejected", "duplicate"];

function ModerationPanel({ categories }: { categories: SapCategory[] }) {
  const { t, intlLocale } = useI18n();
  const [stats, setStats] = useState<SapAdminStats | null>(null);
  const [status, setStatus] = useState<SapReportStatus>("submitted");
  const [reports, setReports] = useState<SapReport[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<SapAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<SapReport | null>(null);
  useEffect(() => { const id=new URLSearchParams(window.location.search).get("reviewReport"); if(!id)return;const controller=new AbortController();getReport(id,controller.signal).then(value=>{if(!controller.signal.aborted)setActive(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Laporan belum dapat dimuat.");});return()=>controller.abort(); }, []);

  const categoryName = useCallback((id: string | null) => t(categories.find(c => c.id === id)?.name || id || "Belum dikenali"), [categories, t]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [statsData, page, auditPage] = await Promise.all([
        getAdminStats(signal), listAdminReports(status, undefined, signal), listAuditEvents(undefined, signal),
      ]);
      if (signal?.aborted) return;
      setStats(statsData); setReports(page.items); setNextCursor(page.nextCursor); setAudit(auditPage.items);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Data moderasi belum dapat dimuat.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const page = await listAdminReports(status, nextCursor);
      setReports(current => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat halaman berikutnya."); }
  }

  function onDecided() { setActive(null); void load(); }

  return <div className={admin.wrap}>
    <div className={admin.statRow}>
      <div className={admin.statBox}><span>{t("Menunggu")}</span><strong>{stats?.submittedReports ?? "—"}</strong><small>{t("Perlu diperiksa")}</small></div>
      <div className={admin.statBox}><span>{t("Terverifikasi")}</span><strong>{stats?.verifiedReports ?? "—"}</strong></div>
      <div className={admin.statBox}><span>{t("Dalam penanganan")}</span><strong>{stats?.inProgressReports ?? "—"}</strong></div>
      <div className={admin.statBox}><span>{t("Selesai")}</span><strong>{stats?.resolvedReports ?? "—"}</strong></div>
      <div className={admin.statBox}><span>{t("Tertua menunggu")}</span><strong style={{ fontSize: "1rem" }}>{stats?.oldestPendingAt ? fmt(stats.oldestPendingAt, intlLocale) : "—"}</strong></div>
    </div>

    <section className={admin.panel}>
      <div className={admin.panelHead}><ClipboardList size={22} /><h2>{t("Antrean laporan")}</h2></div>
      <div className={admin.toolbar}>
        <span className={styles.selectWrap}>
          <select aria-label={t("Filter status")} value={status} onChange={event => setStatus(event.target.value as SapReportStatus)}>
            {FILTERS.map(value => <option key={value} value={value}>{t(STATUS_LABEL[value])}</option>)}
          </select>
        </span>
        <button className={styles.outlineButton} type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? admin.spin : undefined} />{t("Muat ulang")}</button>
      </div>
      {error && <p className={admin.formError} role="alert">{t(error)}</p>}
      {loading ? <div className={admin.empty} role="status"><Loader2 className={admin.spin} size={22} /> {" "}{t("Memuat…")}</div>
        : reports.length === 0 ? <div className={admin.empty}>{t("Tidak ada laporan berstatus")}{" "}{STATUS_LABEL[status].toLowerCase()}.</div>
        : <div className={admin.reportList}>
            {reports.map(report => (
              <button key={report.id} type="button" className={admin.reportRow} onClick={() => setActive(report)}>
                <span>
                  <strong>{t(categoryName(report.categoryId))} · {report.description.slice(0, 60) || t("Tanpa deskripsi")}</strong>
                  <small><MapPin size={12} /> {report.location.latitude.toFixed(4)}, {report.location.longitude.toFixed(4)} · {fmt(report.createdAt, intlLocale)}</small>
                </span>
                <StatusBadge status={report.status} />
                <span className={admin.rev}>rev {report.revision}</span>
              </button>
            ))}
          </div>}
      {nextCursor && !loading && <div className={admin.pager}><button className={styles.outlineButton} type="button" onClick={loadMore}>{t("Muat lebih banyak")}</button></div>}
    </section>

    <section className={admin.panel}>
      <div className={admin.panelHead}><FileClock size={22} /><h2>{t("Jejak audit")}</h2></div>
      {audit.length === 0 ? <div className={admin.empty}>{t("Belum ada aktivitas audit.")}</div>
        : <div className={admin.auditList}>
            {audit.map(event => (
              <div key={event.id} className={admin.auditRow}>
                <code>{event.action}</code>
                <span>{t("oleh")}{" "}{event.actorDisplayName}</span>
                <time>{fmt(event.createdAt, intlLocale)}</time>
              </div>
            ))}
          </div>}
    </section>

    {active && <DecisionModal report={active} categoryName={categoryName} onClose={() => setActive(null)} onDecided={onDecided} />}
  </div>;
}

// --- Decision modal --------------------------------------------------------

function DecisionModal({ report, categoryName, onClose, onDecided }: {
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
  const [resolutionIds, setResolutionIds] = useState<string[]>([]);
  const [reportRevision, setReportRevision] = useState(report.revision);
  const [mediaReview, setMediaReview] = useState<{ mediaId: string; url: string; renditions: EvidenceRendition[] }[]>([]);
  const [renditionChoice, setRenditionChoice] = useState<Record<string, string>>({});
  const [publicationAssets, setPublicationAssets] = useState<ReportLifecycle["publicationAssets"]>([]);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isInitialVerify = next === "verified" && !VERIFIED_FAMILY.includes(report.status);
  const needsDuplicate = next === "duplicate";
  const needsResolutionMedia = next === "resolved";
  const canPublish = VERIFIED_FAMILY.includes(next);

  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape" && !busy) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!needsDuplicate || duplicates !== null) return;
    const controller = new AbortController();
    getReportDuplicates(report.id, controller.signal)
      .then(page => setDuplicates(page.items))
      .catch(() => { if (!controller.signal.aborted) setDuplicates([]); });
    return () => controller.abort();
  }, [needsDuplicate, duplicates, report.id]);

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
  const saveBlockers = [
    ...(!reasonOk ? ["Isi alasan keputusan sepanjang 5–1000 karakter."] : []),
    ...(needsDuplicate && !duplicateOfId ? ["Pilih laporan kanonis untuk keputusan duplikat."] : []),
    ...(isInitialVerify && !publicSummary.trim() ? ["Isi ringkasan publik untuk verifikasi awal."] : []),
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
    if (!canPublish || report.mediaIds.length === 0) { setMediaReview([]); return; }
    const controller = new AbortController();
    setEvidenceError("");
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
    });
    return () => controller.abort();
  }, [canPublish, report.id, report.mediaIds]);

  async function refreshReportEvidence() {
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

  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={styles.composerModal} role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <button className={styles.modalClose} type="button" onClick={onClose} disabled={busy} aria-label={t("Tutup")}><X size={20} /></button>
      <span className={styles.modalIcon}><ShieldCheck size={26} /></span>
      <h2 id="decision-title">{t("Putuskan laporan")}</h2>
      <p style={{ margin: "0 0 4px", color: "#5c6f67", fontSize: "0.86rem" }}>
        {t(categoryName(report.categoryId))} {" "}{t("· saat ini")}{" "}<StatusBadge status={report.status} />
      </p>
      <div className={admin.form}>
        <label className={admin.field}>
          <span>{t("Status baru")}</span>
          <span className={styles.selectWrap}>
            <select value={next} onChange={event => setNext(event.target.value as SapReportStatus)} aria-label={t("Status baru")}>
              {options.map(value => <option key={value} value={value}>{t(STATUS_LABEL[value])}{value === report.status ? t(" (perbarui)") : ""}</option>)}
            </select>
          </span>
        </label>

        {needsDuplicate && <div className={admin.field}>
          <span>{t("Duplikat dari")}{" "}<small>{t("pilih laporan kanonis (terverifikasi) dalam radius 100 m & 24 jam.")}</small></span>
          {duplicates === null ? <div className={admin.empty}><Loader2 className={admin.spin} size={18} /> {" "}{t("Memuat kandidat…")}</div>
            : duplicates.length === 0 ? <div className={admin.empty}>{t("Tidak ada kandidat duplikat yang cocok.")}</div>
            : <div className={admin.dupList}>{duplicates.map(candidate => (
                <button key={candidate.reportId} type="button" className={admin.dupRow} data-active={duplicateOfId === candidate.reportId}
                  onClick={() => setDuplicateOfId(candidate.reportId)}>
                  <StatusBadge status={candidate.status} />
                  <span>{Math.round(candidate.distanceMeters)} m · {fmt(candidate.occurredAt, intlLocale)}</span>
                  <span className={admin.rev}>{candidate.reportId.slice(0, 8)}</span>
                </button>
              ))}</div>}
        </div>}

        {(isInitialVerify || canPublish) && <label className={admin.field}>
          <span>{t("Ringkasan publik")}{" "}{isInitialVerify ? "" : <small>{t("(opsional)")}</small>}</span>
          <textarea value={publicSummary} maxLength={500} onChange={event => setPublicSummary(event.target.value)}
            placeholder={t("Ringkasan yang tampil di peta publik")} aria-label={t("Ringkasan publik")} />
        </label>}

        {canPublish && report.mediaIds.length > 0 && <div className={admin.field}>
          <span>{t("Persetujuan foto publik")}{" "}<small>{t("(opsional)")}</small></span>
          <small>{t("Verifikasi laporan tidak memerlukan foto publik atau izin publikasi foto. Publikasi foto memerlukan versi siap dan izin pemilik untuk kanal tersebut.")}</small>
          <small>{t("Setujui web langsung mengizinkan foto tampil di halaman publik SAP. Persetujuan Instagram terpisah dari penerbitan postingan.")}</small>
          {evidenceMessage && <small style={{ color: "#08764f" }}>{t(evidenceMessage)}</small>}
          {evidenceError && <small style={{ color: "#c0392b" }}>{t(evidenceError)}</small>}
          <div className={admin.evidenceGrid}>{mediaReview.map((item, index) => {
            const ready = item.renditions.filter(rendition => rendition.status === "ready");
            const selectedRenditionId = renditionChoice[item.mediaId];
            const webApproved = approvedFor(item.mediaId, selectedRenditionId, "web");
            const instagramApproved = approvedFor(item.mediaId, selectedRenditionId, "instagram");
            return <article key={item.mediaId} className={admin.evidenceCard}>
              <img src={item.url} alt={t("Bukti laporan {0}", { "0": index + 1 })} />
              <strong>{t("Foto")}{" "}{index + 1}</strong>
              <div className={admin.publicationStatus}>
                {(["web", "instagram"] as const).map(channel => {
                  const approved = publicationAssets.some(asset => asset.mediaId === item.mediaId && asset.channels.includes(channel));
                  return <span key={channel} data-approved={approved}>
                    {approved ? <ShieldCheck size={14} /> : <X size={14} />}
                    {t(channel === "web"
                      ? approved ? "Web: foto publik disetujui" : "Web: foto belum disetujui"
                      : approved ? "Instagram: foto disetujui" : "Instagram: foto belum disetujui")}
                  </span>;
                })}
              </div>
              <select aria-label={t("Versi bukti foto {0}", { "0": index + 1 })} value={renditionChoice[item.mediaId] ?? ""} onChange={event => setRenditionChoice(old => ({ ...old, [item.mediaId]: event.target.value }))}>
                <option value="">{t("Pilih versi siap")}</option>
                {item.renditions.map(rendition => <option key={rendition.id} value={rendition.id} disabled={rendition.status !== "ready"}>
                  {rendition.status} · r{rendition.revision}
                </option>)}
              </select>
              {!ready.length && <button type="button" className={styles.outlineButton} onClick={() => void renderReportEvidence(item.mediaId)} disabled={!!evidenceBusy}>
                {evidenceBusy === item.mediaId ? t("Menyiapkan…") : t("Siapkan pratinjau bukti")}
              </button>}
              {ready.length > 0 && <div className={admin.checkRow}>
                <button type="button" className={admin.checkChip} data-active={webApproved} onClick={() => void approveMedia(item.mediaId, "web")} disabled={!selectedRenditionId || !!evidenceBusy || webApproved} aria-pressed={webApproved}>
                  <Check size={14} />{t(webApproved ? "Web disetujui" : "Setujui web")}
                </button>
                <button type="button" className={admin.checkChip} data-active={instagramApproved} onClick={() => void approveMedia(item.mediaId, "instagram")} disabled={!selectedRenditionId || !!evidenceBusy || instagramApproved} aria-pressed={instagramApproved}>
                  <Check size={14} />{t(instagramApproved ? "Instagram disetujui" : "Setujui Instagram")}
                </button>
              </div>}
            </article>;
          })}</div>
        </div>}

        {needsResolutionMedia && <div className={admin.field}>
          <span>{t("Bukti penyelesaian")}{" "}<small>{t("(wajib, maks 3 foto)")}</small></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || resolutionIds.length >= 3}
            onChange={event => { void addResolutionMedia(event.target.files); event.target.value = ""; }} aria-label={t("Unggah bukti penyelesaian")} />
          {uploading && <small><Loader2 className={admin.spin} size={14} /> {" "}{t("Mengunggah…")}</small>}
          {resolutionIds.length > 0 && <div className={admin.checkRow}>{resolutionIds.map((id, index) => (
            <span key={id} className={admin.checkChip} data-active="true"><Check size={14} />{t("Bukti")}{" "}{index + 1}
              <button type="button" onClick={() => setResolutionIds(current => current.filter(x => x !== id))} aria-label={t("Hapus bukti {0}", { "0": index + 1 })} style={{ background: "none", border: 0, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={13} /></button>
            </span>
          ))}</div>}
        </div>}

        <label className={admin.field}>
          <span>{t("Alasan")}{" "}<small>{t("(5–1000 karakter, tercatat di audit)")}</small></span>
          <textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)}
            placeholder={t("Jelaskan dasar keputusan ini")} aria-label={t("Alasan keputusan")} />
        </label>

        {error && <p className={admin.formError} role="alert">{t(error)}</p>}
      </div>
      {saveBlockers.length > 0 && <div id="decision-save-requirements" className={admin.saveRequirements} role="status">
        <strong>{t("Keputusan belum dapat disimpan")}</strong>
        <ul>{saveBlockers.map(message => <li key={message}>{t(message)}</li>)}</ul>
      </div>}
      <div className={styles.modalActions}>
        <button className={styles.outlineButton} type="button" onClick={onClose} disabled={busy}>{t("Batal")}</button>
        <button className={styles.primaryButton} type="button" onClick={submit} disabled={!canSubmit} aria-describedby={canSubmit ? undefined : "decision-save-requirements"}>
          {busy ? <><Loader2 className={admin.spin} size={18} />{t("Menyimpan…")}</> : <><Check size={18} />{t("Simpan keputusan")}</>}
        </button>
      </div>
    </div>
  </div>;
}
