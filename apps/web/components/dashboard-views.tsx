"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  ArrowRight, Bell, CalendarDays, Camera, Check, ChevronDown, CircleHelp,
  Clock3, FilePlus2, FileText, Filter, Focus, ImagePlus, Info, Layers3,
  Leaf, Lightbulb, List, LockKeyhole, LogOut, Mail, Map, MapPin, Minus,
  Plus, ScanLine, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles,
  Sun, Trash2, Trophy, Upload, UserRound, X,
} from "lucide-react";
import styles from "./dashboard.module.css";
import ReportWizard, { type ReportSummary } from "./report-wizard";
import ScanResult from "./scan-result";
import AreaView from "./area-view";
import ReportDetail from "./report-detail";
import SettingsView from "./settings-view";
import ScanHistoryView from "./scan-history-view";
import MediaThumbnail from "./media-thumbnail";
import { createBackendScan, waitForBackendScan, type ScanResponse } from "./scan-client";
import type { ScanOperation } from "./scan-client";
import type { SapaActivityPhase } from "./sapa-motion-data";
import type { SapAchievement, SapCategory, SapReport, SapScan, SapStats, SapUser } from "../lib/api/client";
import { useI18n } from "../lib/i18n/provider";


const CameraCapture = dynamic(() => import("./camera-capture"), { ssr: false });

type Tab = "dashboard" | "scan" | "reports" | "map" | "history" | "achievements" | "settings" | "help";
type Props = {
  tab: Exclude<Tab, "dashboard">;
  scans: SapScan[];
  reports: SapReport[];
  stats: SapStats | null;
  achievements: SapAchievement[];
  categories: SapCategory[];
  email: string;
  displayName: string;
  onNavigate: (tab: Tab) => void;
  onScanFinished: () => void;
  onScanActivity: (phase: SapaActivityPhase) => void;
  onOpenReport: () => void;
  reportComposerRequested: boolean;
  onReportSubmitted: (summary: ReportSummary) => void;
  onReportsChanged: () => void;
  onReportWizardChange: (open: boolean) => void;
  onSaveProfile: (name: string) => Promise<void>;
  avatarMediaId: string | null;
  onAvatarChanged: (user: SapUser) => void;
  onSignOut: () => void;
  onAccountDeleted: () => void;
  sapaEnabled: boolean;
  sapaSaving: boolean;
  onToggleSapa: () => void;
};

function categoryName(id: string | null, categories: SapCategory[]) { return categories.find(item => item.id === id)?.name || id || "Belum dikenali"; }

function PageTitle({ title, description }: { title: string; description: string }) {
  const { t } = useI18n();
  return <div data-motion="heading" className={styles.referenceHeading}><h1>{t(title)}</h1><p>{t(description)}</p></div>;
}

function DateFilter({ value, onChange, label = "Pilih periode" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const { t } = useI18n();
  return <span className={styles.selectWrap}><CalendarDays size={19} /><select aria-label={t(label)} value={value} onChange={event => onChange(event.target.value)}><option value="all">{t(label)}</option><option value="7">{t("7 hari terakhir")}</option><option value="30">{t("30 hari terakhir")}</option><option value="90">{t("90 hari terakhir")}</option></select><ChevronDown size={18} /></span>;
}

function inPeriod(date: string, period: string) {
  return period === "all" || Date.now() - new Date(date).getTime() <= Number(period) * 86_400_000;
}

function formatDate(value: string, locale = "id-ID") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function ScanView({ onScanFinished, onScanActivity, onOpenReport, onNavigate, categories }: Pick<Props, "onScanFinished" | "onScanActivity" | "onOpenReport" | "onNavigate" | "categories">) {
  const { t } = useI18n();
  const [cameraOpen, setCameraOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const operationRef = useRef<ScanOperation | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanTakingLong, setScanTakingLong] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => {
    controllerRef.current?.abort();
    onScanActivity("idle");
  }, [onScanActivity]);
  useEffect(() => {
    if (!busy) { setScanTakingLong(false); return; }
    const timer = window.setTimeout(() => setScanTakingLong(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  function selectFile(next: File | null) {
    if (!next) return;
    controllerRef.current?.abort();
    onScanActivity("idle");
    setBusy(false);
    setResult(null);
    operationRef.current = null;
    setScanError("");
    if (next && (!(["image/jpeg", "image/png", "image/webp"].includes(next.type)) || next.size > 10 * 1024 * 1024)) {
      setFile(null);
      setScanError(!["image/jpeg", "image/png", "image/webp"].includes(next.type)
        ? "Format file tidak didukung. Pilih foto JPG, PNG, atau WebP."
        : "Ukuran foto melebihi 10 MB. Pilih foto yang lebih kecil.");
      return;
    }
    setFile(next);
  }

  async function runBackendScan() {
    if (!file || busy) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    onScanActivity("thinking");
    setScanError("");
    try {
      const operation = operationRef.current || { file, idempotencyKey: crypto.randomUUID() };
      operationRef.current = operation;
      const created = await createBackendScan(operation, controller.signal);
      const completed = await waitForBackendScan(created, controller.signal);
      if (!controller.signal.aborted) {
        setResult(completed);
        // A successful HTTP response may still contain a queued or failed scan.
        onScanActivity(completed.status === "succeeded" ? "success" : completed.status === "failed" ? "error" : "idle");
        onScanFinished();
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setScanError(cause instanceof Error ? cause.message : "Scan belum berhasil. Coba lagi.");
        onScanActivity("error");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (result && preview && file) return <ScanResult preview={preview} fileName={file.name} scan={result} categories={categories} onRefresh={runBackendScan} onChangePhoto={() => { setResult(null); window.setTimeout(() => uploadRef.current?.click(), 0); }} onOpenReport={onOpenReport} onOpenHistory={() => onNavigate("history")} />;

  return <>
    <PageTitle title={t("Scan sampah")} description={t("Ambil atau unggah foto untuk mengenali jenis material dengan AI.")} />
    <div className={styles.scanLayout}>
      <div className={styles.scanMain}>
        <div className={styles.scanActions}>
          <button className={styles.primaryButton} type="button" onClick={() => setCameraOpen(true)} disabled={busy}><Camera size={23} strokeWidth={2.2} />{t("Buka kamera")}</button>
          <button className={styles.outlineButton} type="button" onClick={() => uploadRef.current?.click()} disabled={busy}><Upload size={23} />{t("Unggah foto")}</button>
          <input ref={uploadRef} className={styles.srOnly} type="file" onChange={event => { selectFile(event.target.files?.[0] || null); event.target.value = ""; }} aria-label={t("Unggah foto dari perangkat")} />
        </div>
        <button className={styles.scanDrop} type="button" onClick={() => uploadRef.current?.click()} disabled={busy} aria-label={t("Pilih foto sampah dari perangkat")}>
          <span className={styles.scanDropInner}>
            <span className={styles.scanArtwork}>{preview ? <Image src={preview} alt={t("Pratinjau foto sampah")} fill unoptimized sizes="(max-width: 800px) 80vw, 500px" /> : <Image src="/images/dashboard/views/scan-bottle.webp" alt="" fill sizes="(max-width: 800px) 80vw, 500px" />}</span>
            <strong>{file ? file.name : <>{t("Ambil foto atau unggah gambar")}<br />{t("untuk mulai.")}</>}</strong>
            <span className={styles.scanLink}><ImagePlus size={20} />{file ? t("Ganti foto") : t("Pilih foto dari perangkat")}</span>
          </span>
        </button>
      </div>
      <div className={styles.scanAside}>
        <section className={styles.tipsCard}><div className={styles.tipsTitle}><span><Lightbulb size={26} /></span><h2>{t("Tips foto")}</h2></div><div className={styles.tipRow}><Focus size={29} />{t("Objek terlihat jelas")}</div><div className={styles.tipRow}><Sun size={29} />{t("Gunakan cahaya cukup")}</div><div className={styles.tipRow}><Leaf size={29} />{t("Fokus pada sampah yang ingin dikenali.")}</div></section>
        <section className={styles.scanResult}>{file ? <><span className={styles.resultIcon}><ScanLine size={29} /></span><h2>{t("Foto siap diproses")}</h2><p>{t("Foto akan diunggah dan diproses oleh layanan AI SAP. Hasil dapat dilihat kembali di riwayat scan.")}</p><button className={styles.primaryButton} type="button" onClick={runBackendScan} disabled={busy}><ScanLine size={19} />{busy ? t("Memproses foto...") : t("Pindai dengan AI")}</button>{busy && scanTakingLong && <p role="status" className={styles.scanStatus}>{t("Pemindaian masih berlangsung. Hasil dipantau otomatis; proses dapat memerlukan beberapa saat.")}</p>}{scanError && <p role="alert" className={styles.scanError}>{t(scanError)}</p>}</> : <><Image src="/images/dashboard/views/report-empty.webp" alt="" width={235} height={105} /><p>{t("Hasil scan akan muncul")}<br />{t("setelah pemrosesan.")}</p>{scanError && <p role="alert" className={styles.scanError}>{t(scanError)}</p>}</>}</section>
      </div>
    </div>
    {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onUpload={() => { setCameraOpen(false); uploadRef.current?.click(); }} onPhoto={photo => { selectFile(photo); setCameraOpen(false); }} />}
  </>;
}

const statusLegend = [
  ["Menunggu pemeriksaan", "#f4b532"], ["Terverifikasi", "#3473c8"],
  ["Dalam penanganan", "#63b2eb"], ["Selesai", "#4b9e54"],
  ["Ditolak", "#ef6967"], ["Duplikat", "#9aa5b2"],
];
const reportStatus: Record<SapReport["status"], string> = { submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan", resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat" };

function ReportsView({ reports, categories, onReportSubmitted, onReportsChanged, onReportWizardChange, reportComposerRequested }: Pick<Props, "reports" | "categories" | "onReportSubmitted" | "onReportsChanged" | "onReportWizardChange" | "reportComposerRequested">) {
  const { t, intlLocale } = useI18n();
  const [composerOpen, setComposerOpen] = useState(reportComposerRequested);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const filtered = reports.filter(report => (status === "all" || status === report.status) && inPeriod(report.createdAt, period));

  useEffect(() => {
    if (!composerOpen) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") { setComposerOpen(false); onReportWizardChange(false); } }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [composerOpen, onReportWizardChange]);

  function closeWizard() { setComposerOpen(false); onReportWizardChange(false); }

  if (composerOpen) return <ReportWizard categories={categories} onClose={closeWizard} onSubmitted={summary => { onReportSubmitted(summary); closeWizard(); }} />;

  return <>
    <div className={styles.referenceHeadingRow}><PageTitle title={t("Laporan saya")} description={t("Pantau status laporan yang Anda kirim.")} /><div className={styles.reportToolbar}><button className={styles.primaryButton} type="button" onClick={() => { setComposerOpen(true); onReportWizardChange(true); }}><FilePlus2 size={20} />{t("Buat laporan")}</button><span className={styles.selectWrap}><Filter size={19} /><select aria-label={t("Filter status laporan")} value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t("Semua status")}</option>{Object.entries(reportStatus).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select><ChevronDown size={17} /></span><DateFilter value={period} onChange={setPeriod} /></div></div>
    <section className={styles.reportTable}><div className={styles.tableHead}><span><MapPin size={22} />{t("Temuan")}</span><span><CalendarDays size={22} />{t("Dikirim")}</span><span><List size={22} />{t("Status")}</span></div>{filtered.length ? <div className={styles.reportRows}>{filtered.map(report => <article key={report.id} role="button" tabIndex={0} aria-label={t("Lihat detail laporan {0}", { "0": report.description.slice(0, 50) })} onClick={() => setDetailId(report.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailId(report.id); } }}><div className={styles.reportFinding}><MediaThumbnail className={styles.reportPhoto} mediaId={report.mediaIds[0]} alt={t("Foto laporan {0}", { "0": report.description.slice(0, 50) })} /><div><strong>{report.description.slice(0, 80)}</strong><span>{report.location.latitude.toFixed(4)}, {report.location.longitude.toFixed(4)}</span><small>{report.reportedSeverity === "small" ? t("Tumpukan kecil") : report.reportedSeverity === "medium" ? t("Tumpukan sedang") : t("Tumpukan besar")} · {report.timeline.length} {" "}{t("pembaruan")}</small></div></div><span>{formatDate(report.createdAt, intlLocale)}</span><span className={styles.draftBadge}>{t(reportStatus[report.status])}</span></article>)}</div> : <div className={styles.reportEmpty}><Image src="/images/dashboard/views/report-empty.webp" alt="" width={470} height={210} /><h2>{reports.length && status !== "all" ? t("Tidak ada laporan untuk status ini.") : t("Belum ada laporan yang dikirim.")}</h2><p>{reports.length ? t("Ubah filter atau buat laporan baru.") : t("Laporan akan muncul di sini setelah Anda mengirimnya.")}</p></div>}<div className={styles.statusLegend}>{statusLegend.map(([name, color]) => <span key={t(name)}><i style={{ background: color }} />{t(name)}</span>)}</div></section>
    {detailId && <ReportDetail id={detailId} categories={categories} onClose={() => setDetailId(null)} onUpdated={onReportsChanged} />}
  </>;
}

function MapView({ categories }: Pick<Props, "categories">) { return <AreaView categories={categories} />; }

const badgeData = [
  { id: "first_scan", title: "Scan pertama", description: "1 hasil scan dikenali", image: "badge-scan.webp", needed: 1, action: "scan" as Tab, detail: "Selesaikan scan pertama yang berhasil dikenali." },
  { id: "scanner_10", title: "Pemindai 10", description: "10 hasil scan dikenali", image: "badge-ten.webp", needed: 10, action: "scan" as Tab, detail: "Selesaikan sepuluh scan yang berhasil dikenali." },
  { id: "first_verified_report", title: "Laporan terverifikasi", description: "1 laporan terverifikasi", image: "badge-report.webp", needed: 1, action: "reports" as Tab, detail: "Laporan Anda harus lolos pemeriksaan admin." },
  { id: "streak_3", title: "Streak 3 hari", description: "3 hari aktivitas berpoin berturut-turut", image: "badge-streak.webp", needed: 3, action: "history" as Tab, detail: "Lakukan aktivitas berpoin selama tiga hari berturut-turut." },
];
function AchievementsView({ stats, achievements, onNavigate }: Pick<Props, "stats" | "achievements" | "onNavigate">) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const progress = [Math.min(stats?.classifiedScans || 0, 1), Math.min(stats?.classifiedScans || 0, 10), Math.min(stats?.verifiedReports || 0, 1), Math.min(stats?.streakDays || 0, 3)];
  const isUnlocked = (index: number) => { const badge = achievements.find(item => item.id === badgeData[index].id); return !!badge?.unlockedAt && !badge.revokedAt; };
  const unlocked = badgeData.filter((_, index) => isUnlocked(index)).length;
  return <>
    <PageTitle title={t("Pencapaian")} description={t("Lencana untuk aktivitas yang bermakna.")} />
    <div className={styles.badgeSummary}><span className={styles.badgeSummaryIcon}><Trophy size={43} /></span><div><strong>{unlocked} {" "}{t("dari 4")}{" "}<small>{t("lencana terbuka")}</small></strong><p>{t("Terus lakukan aktivitas untuk mendapatkan lencana.")}</p></div><span className={styles.badgeLeaves} aria-hidden="true"><Leaf size={115} /><Leaf size={87} /></span></div>
    <div className={styles.badgeGrid}>{badgeData.map((badge, index) => <button key={badge.title} type="button" className={`${styles.badgeCard} ${styles[`badgeTone${index}`]}`} onClick={() => setSelected(index)}><Image src={`/images/dashboard/views/${badge.image}`} alt="" width={166} height={166} /><div className={styles.badgeCopy}><h2>{t(badge.title)}</h2><p>{t(badge.description)}</p><div className={styles.badgeProgress}><span><i style={{ width: `${progress[index] / badge.needed * 100}%` }} /></span><small>{progress[index]}/{badge.needed}</small></div></div>{isUnlocked(index) && <span className={styles.badgeUnlocked}><Check size={17} />{t("Terbuka")}</span>}</button>)}</div>
    {selected !== null && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><div data-motion="dialog" className={styles.badgeModal} role="dialog" aria-modal="true" aria-labelledby="badge-detail-title"><button className={styles.modalClose} type="button" onClick={() => setSelected(null)} aria-label={t("Tutup detail")}><X size={20} /></button><Image src={`/images/dashboard/views/${badgeData[selected].image}`} alt="" width={166} height={166} /><h2 id="badge-detail-title">{t(badgeData[selected].title)}</h2><p>{t(badgeData[selected].detail)}</p><strong>{t("Progres")}{" "}{progress[selected]} {" "}{t("dari")}{" "}{badgeData[selected].needed}</strong><button className={styles.primaryButton} type="button" onClick={() => { const next = badgeData[selected].action; setSelected(null); onNavigate(next); }}>{t("Lanjutkan aktivitas")}{" "}<ArrowRight size={17} /></button></div></div>}
  </>;
}

const helpTopics = [
  { title: "Scan sampah", description: "Foto dan kenali jenis sampah.", image: "help-scan.webp", tab: "scan" as Tab },
  { title: "Buat laporan", description: "Kirim foto, lokasi, dan waktu kejadian.", image: "help-report.webp", tab: "reports" as Tab },
  { title: "Baca peta area", description: "Pahami ringkasan laporan terverifikasi.", image: "help-map.webp", tab: "map" as Tab },
];
const faqs = [
  ["Bagaimana cara memindai sampah?", "Buka menu Scan, lalu ambil atau unggah foto. Foto akan diproses oleh layanan AI dan hasilnya tersimpan di riwayat scan."],
  ["Mengapa laporan saya belum muncul di peta?", "Laporan yang baru dikirim menunggu pemeriksaan admin. Hanya laporan terverifikasi yang dapat masuk ringkasan peta publik."],
  ["Bagaimana jika GPS ditolak?", "Klik peta atau geser pin untuk memilih titik temuan secara manual, lalu konfirmasikan pin tersebut."],
  ["Apa arti status laporan?", "Menunggu pemeriksaan berarti laporan belum ditinjau; terverifikasi berarti data disetujui; dalam penanganan dan selesai menunjukkan tahap tindak lanjut."],
];

function HelpView({ onNavigate }: Pick<Props, "onNavigate">) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const visibleTopics = helpTopics.filter(topic => `${t(topic.title)} ${t(topic.description)}`.toLowerCase().includes(query.toLowerCase()));
  const visibleFaqs = faqs.map((item, index) => ({ item, index })).filter(({ item }) => `${t(item[0])} ${t(item[1])}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageTitle title={t("Pusat bantuan")} description={t("Temukan panduan untuk memakai SAP.")} />
    <label className={styles.helpSearch}><Search size={24} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Cari bantuan...")} aria-label={t("Cari bantuan")} />{query && <button type="button" onClick={() => setQuery("")} aria-label={t("Hapus pencarian")}><X size={18} /></button>}</label>
    {visibleTopics.length > 0 && <div className={styles.helpCards}>{visibleTopics.map(topic => {
      const index = helpTopics.indexOf(topic);
      return <button data-motion="card" className={`${styles.helpCard} ${styles[`helpTone${index}`]}`} key={topic.title} type="button" onClick={() => onNavigate(topic.tab)}><span className={styles.helpCardIcon}>{index === 0 ? <ScanLine size={30} /> : index === 1 ? <FileText size={30} /> : <Map size={30} />}</span><span className={styles.helpCardCopy}><strong>{t(topic.title)}</strong><small>{t(topic.description)}</small></span><ChevronDown className={styles.helpCardArrow} size={21} /><Image src={`/images/dashboard/views/${topic.image}`} alt="" width={317} height={132} /></button>;
    })}</div>}
    <section className={styles.helpFaq}><h2><SlidersHorizontal size={22} />{t("Pertanyaan yang sering diajukan (FAQ)")}</h2>{visibleFaqs.length ? visibleFaqs.map(({ item, index }) => <div className={styles.helpFaqItem} key={item[0]}><button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>{t(item[0])}<ChevronDown size={19} /></button>{openFaq === index && <p>{t(item[1])}</p>}</div>) : <p className={styles.noHelp}>{t("Tidak ada panduan yang cocok. Coba kata kunci lain.")}</p>}<div className={styles.helpInfo}><Info size={22} />{t("Foto dan lokasi laporan tidak langsung ditampilkan ke publik.")}<span aria-hidden="true"><Leaf size={70} /></span></div></section>
  </>;
}

export default function DashboardViews(props: Props) {
  const { tab } = props;
  return <div className={`${styles.subPage} ${tab === "settings" || tab === "history" ? "" : styles.referenceView}`}>
    {tab === "scan" && <ScanView onScanFinished={props.onScanFinished} onScanActivity={props.onScanActivity} onOpenReport={props.onOpenReport} onNavigate={props.onNavigate} categories={props.categories} />}
    {tab === "reports" && <ReportsView reports={props.reports} categories={props.categories} onReportSubmitted={props.onReportSubmitted} onReportsChanged={props.onReportsChanged} onReportWizardChange={props.onReportWizardChange} reportComposerRequested={props.reportComposerRequested} />}
    {tab === "map" && <MapView categories={props.categories} />}
    {tab === "history" && <ScanHistoryView scans={props.scans} categories={props.categories} onNavigate={props.onNavigate} onOpenReport={props.onOpenReport} />}
    {tab === "achievements" && <AchievementsView stats={props.stats} achievements={props.achievements} onNavigate={props.onNavigate} />}
    {tab === "settings" && <SettingsView email={props.email} displayName={props.displayName} avatarMediaId={props.avatarMediaId} onSaveProfile={props.onSaveProfile} onAvatarChanged={props.onAvatarChanged} onSignOut={props.onSignOut} onAccountDeleted={props.onAccountDeleted} sapaEnabled={props.sapaEnabled} sapaSaving={props.sapaSaving} onToggleSapa={props.onToggleSapa} />}
    {tab === "help" && <HelpView onNavigate={props.onNavigate} />}
  </div>;
}
