"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ClipboardList, Cpu, FileClock, Loader2, MapPin, RefreshCw, ShieldCheck,
} from "lucide-react";
import styles from "./dashboard.module.css";
import admin from "./admin-panel.module.css";
import { DecisionModal } from "./moderation/decision-modal";
import { STATUS_LABEL, STATUS_COLOR } from "./moderation/report-status";
import {
  ApiError, getReport, getAdminStats, getScanSettings, listAdminReports,
  listAuditEvents, updateScanSettings,
  type SapAdminStats, type SapAuditEvent, type SapCategory,
  type SapReport, type SapReportStatus, type SapScanSettings,
} from "../lib/api/client";
import { useI18n } from "../lib/i18n/provider";
import AnimatedNumber from "./motion/animated-number";


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
      <div data-motion="card" className={admin.statBox}><span>{t("Menunggu")}</span><strong><AnimatedNumber value={stats?.submittedReports ?? "—"} /></strong><small>{t("Perlu diperiksa")}</small></div>
      <div data-motion="card" className={admin.statBox}><span>{t("Terverifikasi")}</span><strong><AnimatedNumber value={stats?.verifiedReports ?? "—"} /></strong></div>
      <div data-motion="card" className={admin.statBox}><span>{t("Dalam penanganan")}</span><strong><AnimatedNumber value={stats?.inProgressReports ?? "—"} /></strong></div>
      <div data-motion="card" className={admin.statBox}><span>{t("Selesai")}</span><strong><AnimatedNumber value={stats?.resolvedReports ?? "—"} /></strong></div>
      <div data-motion="card" className={admin.statBox}><span>{t("Tertua menunggu")}</span><strong style={{ fontSize: "1rem" }}>{stats?.oldestPendingAt ? fmt(stats.oldestPendingAt, intlLocale) : "—"}</strong></div>
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

    {active && <DecisionModal key={active.id} report={active} categoryName={categoryName} onClose={() => setActive(null)} onDecided={onDecided} />}
  </div>;
}
