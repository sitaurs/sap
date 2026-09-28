"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { createBackendScan, waitForBackendScan, type ScanResponse } from "./scan-client";
import type { ScanOperation } from "./scan-client";
import { deleteAccount, reauthenticate, type SapAchievement, type SapCategory, type SapReport, type SapScan, type SapStats } from "../lib/api/client";

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
  onOpenReport: () => void;
  reportComposerRequested: boolean;
  onReportSubmitted: (summary: ReportSummary) => void;
  onReportsChanged: () => void;
  onReportWizardChange: (open: boolean) => void;
  onSaveProfile: (name: string) => Promise<void>;
  onSignOut: () => void;
  onAccountDeleted: () => void;
  sapaEnabled: boolean;
  sapaSaving: boolean;
  onToggleSapa: () => void;
};

function categoryName(id: string | null, categories: SapCategory[]) { return categories.find(item => item.id === id)?.name || id || "Belum dikenali"; }

function PageTitle({ title, description }: { title: string; description: string }) {
  return <div className={styles.referenceHeading}><h1>{title}</h1><p>{description}</p></div>;
}

function DateFilter({ value, onChange, label = "Pilih periode" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <span className={styles.selectWrap}><CalendarDays size={19} /><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}><option value="all">{label}</option><option value="7">7 hari terakhir</option><option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option></select><ChevronDown size={18} /></span>;
}

function inPeriod(date: string, period: string) {
  return period === "all" || Date.now() - new Date(date).getTime() <= Number(period) * 86_400_000;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function ScanView({ onScanFinished, onOpenReport, onNavigate, categories }: Pick<Props, "onScanFinished" | "onOpenReport" | "onNavigate" | "categories">) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const operationRef = useRef<ScanOperation | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function selectFile(next: File | null) {
    controllerRef.current?.abort();
    setResult(null);
    operationRef.current = null;
    setScanError("");
    if (next && (!(["image/jpeg", "image/png", "image/webp"].includes(next.type)) || next.size > 10 * 1024 * 1024)) {
      setFile(null);
      setScanError("Pilih foto JPG, PNG, atau WebP dengan ukuran maksimal 10 MB.");
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
    setScanError("");
    try {
      const operation = operationRef.current || { file, idempotencyKey: crypto.randomUUID() };
      operationRef.current = operation;
      const created = await createBackendScan(operation, controller.signal);
      const completed = await waitForBackendScan(created, controller.signal);
      if (!controller.signal.aborted) { setResult(completed); onScanFinished(); }
    } catch (cause) {
      if (!controller.signal.aborted) setScanError(cause instanceof Error ? cause.message : "Scan belum berhasil. Coba lagi.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (result && preview && file) return <ScanResult preview={preview} fileName={file.name} scan={result} categories={categories} onRefresh={runBackendScan} onChangePhoto={() => { setResult(null); window.setTimeout(() => uploadRef.current?.click(), 0); }} onOpenReport={onOpenReport} onOpenHistory={() => onNavigate("history")} />;

  return <>
    <PageTitle title="Scan sampah" description="Unggah foto untuk mengenali jenis material dengan AI." />
    <div className={styles.scanLayout}>
      <div className={styles.scanMain}>
        <div className={styles.scanActions}>
          <button className={styles.primaryButton} type="button" onClick={() => cameraRef.current?.click()}><Camera size={23} strokeWidth={2.2} />Buka kamera</button>
          <button className={styles.outlineButton} type="button" onClick={() => uploadRef.current?.click()}><Upload size={23} />Unggah foto</button>
          <input ref={cameraRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => selectFile(event.target.files?.[0] || null)} aria-label="Ambil foto dengan kamera" />
          <input ref={uploadRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectFile(event.target.files?.[0] || null)} aria-label="Unggah foto dari perangkat" />
        </div>
        <button className={styles.scanDrop} type="button" onClick={() => uploadRef.current?.click()} aria-label="Pilih foto sampah dari perangkat">
          <span className={styles.scanDropInner}>
            <span className={styles.scanArtwork}>{preview ? <Image src={preview} alt="Pratinjau foto sampah" fill unoptimized sizes="(max-width: 800px) 80vw, 500px" /> : <Image src="/images/dashboard/views/scan-bottle.webp" alt="" fill sizes="(max-width: 800px) 80vw, 500px" />}</span>
            <strong>{file ? file.name : "Ambil foto atau unggah gambar\nuntuk mulai."}</strong>
            <span className={styles.scanLink}><ImagePlus size={20} />{file ? "Ganti foto" : "Pilih foto dari perangkat"}</span>
          </span>
        </button>
      </div>
      <div className={styles.scanAside}>
        <section className={styles.tipsCard}><div className={styles.tipsTitle}><span><Lightbulb size={26} /></span><h2>Tips foto</h2></div><div className={styles.tipRow}><Focus size={29} />Objek terlihat jelas</div><div className={styles.tipRow}><Sun size={29} />Gunakan cahaya cukup</div><div className={styles.tipRow}><Leaf size={29} />Fokus pada sampah yang ingin dikenali.</div></section>
        <section className={styles.scanResult}>{file ? <><span className={styles.resultIcon}><ScanLine size={29} /></span><h2>Foto siap diproses</h2><p>Foto akan diunggah dan diproses oleh layanan AI SAP. Hasil dapat dilihat kembali di riwayat scan.</p><button className={styles.primaryButton} type="button" onClick={runBackendScan} disabled={busy}><ScanLine size={19} />{busy ? "Memproses foto..." : "Pindai dengan AI"}</button>{scanError && <p role="alert" className={styles.scanError}>{scanError}</p>}</> : <><Image src="/images/dashboard/views/report-empty.webp" alt="" width={235} height={105} /><p>Hasil scan akan muncul<br />setelah pemrosesan.</p>{scanError && <p role="alert" className={styles.scanError}>{scanError}</p>}</>}</section>
      </div>
    </div>
  </>;
}

const statusLegend = [
  ["Menunggu pemeriksaan", "#f4b532"], ["Terverifikasi", "#3473c8"],
  ["Dalam penanganan", "#63b2eb"], ["Selesai", "#4b9e54"],
  ["Ditolak", "#ef6967"], ["Duplikat", "#9aa5b2"],
];
const reportStatus: Record<SapReport["status"], string> = { submitted: "Menunggu pemeriksaan", verified: "Terverifikasi", in_progress: "Dalam penanganan", resolved: "Selesai", rejected: "Ditolak", duplicate: "Duplikat" };

function ReportsView({ reports, categories, onReportSubmitted, onReportsChanged, onReportWizardChange, reportComposerRequested }: Pick<Props, "reports" | "categories" | "onReportSubmitted" | "onReportsChanged" | "onReportWizardChange" | "reportComposerRequested">) {
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
    <div className={styles.referenceHeadingRow}><PageTitle title="Laporan saya" description="Pantau status laporan yang Anda kirim." /><div className={styles.reportToolbar}><button className={styles.primaryButton} type="button" onClick={() => { setComposerOpen(true); onReportWizardChange(true); }}><FilePlus2 size={20} />Buat laporan</button><span className={styles.selectWrap}><Filter size={19} /><select aria-label="Filter status laporan" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Semua status</option>{Object.entries(reportStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={17} /></span><DateFilter value={period} onChange={setPeriod} /></div></div>
    <section className={styles.reportTable}><div className={styles.tableHead}><span><MapPin size={22} />Temuan</span><span><CalendarDays size={22} />Dikirim</span><span><List size={22} />Status</span></div>{filtered.length ? <div className={styles.reportRows}>{filtered.map(report => <article key={report.id} role="button" tabIndex={0} aria-label={`Lihat detail laporan ${report.description.slice(0, 50)}`} onClick={() => setDetailId(report.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailId(report.id); } }}><div><strong>{report.description.slice(0, 80)}</strong><span>{report.location.latitude.toFixed(4)}, {report.location.longitude.toFixed(4)}</span><small>{report.reportedSeverity === "small" ? "Tumpukan kecil" : report.reportedSeverity === "medium" ? "Tumpukan sedang" : "Tumpukan besar"} · {report.timeline.length} pembaruan</small></div><span>{formatDate(report.createdAt)}</span><span className={styles.draftBadge}>{reportStatus[report.status]}</span></article>)}</div> : <div className={styles.reportEmpty}><Image src="/images/dashboard/views/report-empty.webp" alt="" width={470} height={210} /><h2>{reports.length && status !== "all" ? "Tidak ada laporan untuk status ini." : "Belum ada laporan yang dikirim."}</h2><p>{reports.length ? "Ubah filter atau buat laporan baru." : "Laporan akan muncul di sini setelah Anda mengirimnya."}</p></div>}<div className={styles.statusLegend}>{statusLegend.map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}</div></section>
    {detailId && <ReportDetail id={detailId} categories={categories} onClose={() => setDetailId(null)} onUpdated={onReportsChanged} />}
  </>;
}

function MapView({ categories }: Pick<Props, "categories">) { return <AreaView categories={categories} />; }

function HistoryView({ scans, categories, onNavigate }: Pick<Props, "scans" | "categories" | "onNavigate">) {
  const [filter, setFilter] = useState<"all" | "recognized" | "unrecognized">("all");
  const [period, setPeriod] = useState("all");
  const filtered = scans.filter(scan => (filter === "all" || (filter === "recognized" ? scan.outcome === "classified" : scan.outcome === "unknown" || scan.outcome === "no_waste")) && inPeriod(scan.createdAt, period));
  return <>
    <PageTitle title="Riwayat scan" description="Lihat kembali hasil pemindaian Anda." />
    <div className={styles.historyFilters}><div className={styles.filterPills} role="group" aria-label="Filter riwayat scan">{[["all", "Semua"], ["recognized", "Dikenali"], ["unrecognized", "Belum dikenali"]].map(([value, label]) => <button key={value} className={filter === value ? styles.filterActive : ""} type="button" onClick={() => setFilter(value as typeof filter)} aria-pressed={filter === value}>{label}</button>)}</div><DateFilter value={period} onChange={setPeriod} /></div>
    <section className={styles.historyBody}>{filtered.length ? <div className={styles.historyList}>{filtered.map(scan => <article key={scan.id}><span className={styles.historyListIcon}><Camera size={27} /></span><div><strong>{scan.outcome === "no_waste" ? "Tidak ada sampah terdeteksi" : categoryName(scan.categoryId, categories)}</strong><span>Scan #{scan.id.slice(0, 8)}</span><small>{formatDate(scan.createdAt)} · {scan.status === "succeeded" ? "Selesai" : scan.status === "failed" ? "Gagal diproses" : "Dalam proses"}</small></div><span className={styles.unrecognizedBadge}>{scan.outcome === "classified" ? "Dikenali" : scan.outcome === "unknown" ? "Belum dikenali" : scan.outcome === "no_waste" ? "Tidak terdeteksi" : scan.status}</span></article>)}</div> : <div className={styles.historyEmpty}><Image src="/images/dashboard/views/history-empty.webp" alt="" width={670} height={286} /><h2>Belum ada riwayat scan.</h2><p>Mulai scan untuk melihat hasil dan aktivitas Anda di sini.</p><button className={styles.primaryButton} type="button" onClick={() => onNavigate("scan")}><Camera size={20} strokeWidth={2.2} />Mulai scan</button></div>}</section>
  </>;
}

const badgeData = [
  { id: "first_scan", title: "Scan pertama", description: "1 hasil scan dikenali", image: "badge-scan.webp", needed: 1, action: "scan" as Tab, detail: "Selesaikan scan pertama yang berhasil dikenali." },
  { id: "scanner_10", title: "Pemindai 10", description: "10 hasil scan dikenali", image: "badge-ten.webp", needed: 10, action: "scan" as Tab, detail: "Selesaikan sepuluh scan yang berhasil dikenali." },
  { id: "first_verified_report", title: "Laporan terverifikasi", description: "1 laporan terverifikasi", image: "badge-report.webp", needed: 1, action: "reports" as Tab, detail: "Laporan Anda harus lolos pemeriksaan admin." },
  { id: "streak_3", title: "Streak 3 hari", description: "3 hari aktivitas berpoin berturut-turut", image: "badge-streak.webp", needed: 3, action: "history" as Tab, detail: "Lakukan aktivitas berpoin selama tiga hari berturut-turut." },
];
function AchievementsView({ stats, achievements, onNavigate }: Pick<Props, "stats" | "achievements" | "onNavigate">) {
  const [selected, setSelected] = useState<number | null>(null);
  const progress = [Math.min(stats?.classifiedScans || 0, 1), Math.min(stats?.classifiedScans || 0, 10), Math.min(stats?.verifiedReports || 0, 1), Math.min(stats?.streakDays || 0, 3)];
  const isUnlocked = (index: number) => { const badge = achievements.find(item => item.id === badgeData[index].id); return !!badge?.unlockedAt && !badge.revokedAt; };
  const unlocked = badgeData.filter((_, index) => isUnlocked(index)).length;
  return <>
    <PageTitle title="Pencapaian" description="Lencana untuk aktivitas yang bermakna." />
    <div className={styles.badgeSummary}><span className={styles.badgeSummaryIcon}><Trophy size={43} /></span><div><strong>{unlocked} dari 4 <small>lencana terbuka</small></strong><p>Terus lakukan aktivitas untuk mendapatkan lencana.</p></div><span className={styles.badgeLeaves} aria-hidden="true"><Leaf size={115} /><Leaf size={87} /></span></div>
    <div className={styles.badgeGrid}>{badgeData.map((badge, index) => <button key={badge.title} type="button" className={`${styles.badgeCard} ${styles[`badgeTone${index}`]}`} onClick={() => setSelected(index)}><Image src={`/images/dashboard/views/${badge.image}`} alt="" width={166} height={166} /><div className={styles.badgeCopy}><h2>{badge.title}</h2><p>{badge.description}</p><div className={styles.badgeProgress}><span><i style={{ width: `${progress[index] / badge.needed * 100}%` }} /></span><small>{progress[index]}/{badge.needed}</small></div></div>{isUnlocked(index) && <span className={styles.badgeUnlocked}><Check size={17} />Terbuka</span>}</button>)}</div>
    {selected !== null && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><div className={styles.badgeModal} role="dialog" aria-modal="true" aria-labelledby="badge-detail-title"><button className={styles.modalClose} type="button" onClick={() => setSelected(null)} aria-label="Tutup detail"><X size={20} /></button><Image src={`/images/dashboard/views/${badgeData[selected].image}`} alt="" width={166} height={166} /><h2 id="badge-detail-title">{badgeData[selected].title}</h2><p>{badgeData[selected].detail}</p><strong>Progres {progress[selected]} dari {badgeData[selected].needed}</strong><button className={styles.primaryButton} type="button" onClick={() => { const next = badgeData[selected].action; setSelected(null); onNavigate(next); }}>Lanjutkan aktivitas <ArrowRight size={17} /></button></div></div>}
  </>;
}

function SettingsView({ email, displayName, onSaveProfile, onSignOut, onAccountDeleted, sapaEnabled, sapaSaving, onToggleSapa }: Pick<Props, "email" | "displayName" | "onSaveProfile" | "onSignOut" | "onAccountDeleted" | "sapaEnabled" | "sapaSaving" | "onToggleSapa">) {
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletionQueued, setDeletionQueued] = useState(false);
  useEffect(() => setName(displayName), [displayName]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try { await onSaveProfile(name.trim()); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Profil belum tersimpan."); }
    finally { setSaving(false); }
  }
  async function submitDeletion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirm !== "HAPUS AKUN" || deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    try { await reauthenticate(deletePassword); await deleteAccount(); setDeletionQueued(true); setDeletePassword(""); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Permintaan penghapusan belum berhasil."); }
    finally { setDeleteBusy(false); }
  }
  return <>
    <PageTitle title="Pengaturan" description="Kelola akun dan preferensi SAP." />
    <div className={styles.settingsGrid}><section className={styles.profileCard}><h2><UserRound size={27} />Profil</h2><form onSubmit={submit}><label>Nama lengkap<span><UserRound size={20} /><input value={name} onChange={event => setName(event.target.value)} placeholder="Nama Anda" minLength={2} required /></span></label><label>Email<span><Mail size={20} /><input type="email" value={email} readOnly aria-readonly="true" /></span></label><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button>{error && <p role="alert">{error}</p>}{saved && <p role="status">Profil berhasil disimpan.</p>}</form><Image className={styles.settingsArt} src="/images/dashboard/views/settings-profile.webp" alt="" width={420} height={129} /></section><div className={styles.settingsRight}><section className={styles.privacyCard}><h2><ShieldCheck size={26} />Privasi laporan</h2><span className={styles.privacyIcon}><LockKeyhole size={27} /></span><p>Foto dan lokasi laporan bersifat privat sampai publikasi data yang aman.</p><Image src="/images/dashboard/views/settings-privacy.webp" alt="" width={245} height={132} /></section></div></div>
    <section className={styles.sapaSettingCard} aria-label="Pengaturan Pet SAPA"><Image src="/images/sapa/SAPA_Chat_Avatar.png" alt="" width={54} height={54} /><div><h2>Pet SAPA</h2><p>Tampilkan asisten kecil di dashboard.</p></div><button className={`${styles.toggle} ${sapaEnabled ? styles.toggleOn : ""}`} type="button" role="switch" aria-label="Aktifkan Pet SAPA" aria-checked={sapaEnabled} disabled={sapaSaving} onClick={onToggleSapa}><span /></button></section>
    <section className={styles.accountCard}><h2><Settings size={25} />Akun</h2><div><button className={styles.signOutAction} type="button" onClick={onSignOut}><LogOut size={29} /><span><strong>Keluar</strong><small>Akhiri sesi akun pada perangkat ini.</small></span></button><div className={styles.deleteAction}><button type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={20} />Hapus akun</button><small>Penghapusan akun dan data diproses secara permanen.</small></div></div></section>
    {deleteOpen && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !deletionQueued) setDeleteOpen(false); }}><div className={styles.composerModal} role="dialog" aria-modal="true" aria-labelledby="delete-account-title"><span className={styles.modalIcon}><Trash2 size={27} /></span><h2 id="delete-account-title">{deletionQueued ? "Permintaan diterima" : "Hapus akun SAP?"}</h2>{deletionQueued ? <><p>Permintaan penghapusan akun telah diterima dan sedang diproses.</p><button className={styles.primaryButton} type="button" onClick={onAccountDeleted}>Selesai</button></> : <form onSubmit={submitDeletion}><p>Tindakan ini akan menghapus akun dan data secara permanen. Masukkan kata sandi dan ketik HAPUS AKUN untuk melanjutkan.</p><label>Kata sandi<input type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} required /></label><label>Ketik HAPUS AKUN<input value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} required /></label>{deleteError && <p role="alert">{deleteError}</p>}<div className={styles.modalActions}><button className={styles.outlineButton} type="button" onClick={() => setDeleteOpen(false)}>Batal</button><button className={styles.dangerButton} type="submit" disabled={deleteBusy || deleteConfirm !== "HAPUS AKUN"}>{deleteBusy ? "Memproses…" : "Hapus akun permanen"}</button></div></form>}</div></div>}
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
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const visibleTopics = helpTopics.filter(topic => `${topic.title} ${topic.description}`.toLowerCase().includes(query.toLowerCase()));
  const visibleFaqs = faqs.map((item, index) => ({ item, index })).filter(({ item }) => `${item[0]} ${item[1]}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageTitle title="Pusat bantuan" description="Temukan panduan untuk memakai SAP." />
    <label className={styles.helpSearch}><Search size={24} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari bantuan..." aria-label="Cari bantuan" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian"><X size={18} /></button>}</label>
    {visibleTopics.length > 0 && <div className={styles.helpCards}>{visibleTopics.map(topic => {
      const index = helpTopics.indexOf(topic);
      return <button className={`${styles.helpCard} ${styles[`helpTone${index}`]}`} key={topic.title} type="button" onClick={() => onNavigate(topic.tab)}><span className={styles.helpCardIcon}>{index === 0 ? <ScanLine size={30} /> : index === 1 ? <FileText size={30} /> : <Map size={30} />}</span><span className={styles.helpCardCopy}><strong>{topic.title}</strong><small>{topic.description}</small></span><ChevronDown className={styles.helpCardArrow} size={21} /><Image src={`/images/dashboard/views/${topic.image}`} alt="" width={317} height={132} /></button>;
    })}</div>}
    <section className={styles.helpFaq}><h2><SlidersHorizontal size={22} />Pertanyaan yang sering diajukan (FAQ)</h2>{visibleFaqs.length ? visibleFaqs.map(({ item, index }) => <div className={styles.helpFaqItem} key={item[0]}><button type="button" onClick={() => setOpenFaq(openFaq === index ? null : index)} aria-expanded={openFaq === index}>{item[0]}<ChevronDown size={19} /></button>{openFaq === index && <p>{item[1]}</p>}</div>) : <p className={styles.noHelp}>Tidak ada panduan yang cocok. Coba kata kunci lain.</p>}<div className={styles.helpInfo}><Info size={22} />Foto dan lokasi laporan tidak langsung ditampilkan ke publik.<span aria-hidden="true"><Leaf size={70} /></span></div></section>
  </>;
}

export default function DashboardViews(props: Props) {
  const { tab } = props;
  return <div className={`${styles.subPage} ${styles.referenceView}`}>
    {tab === "scan" && <ScanView onScanFinished={props.onScanFinished} onOpenReport={props.onOpenReport} onNavigate={props.onNavigate} categories={props.categories} />}
    {tab === "reports" && <ReportsView reports={props.reports} categories={props.categories} onReportSubmitted={props.onReportSubmitted} onReportsChanged={props.onReportsChanged} onReportWizardChange={props.onReportWizardChange} reportComposerRequested={props.reportComposerRequested} />}
    {tab === "map" && <MapView categories={props.categories} />}
    {tab === "history" && <HistoryView scans={props.scans} categories={props.categories} onNavigate={props.onNavigate} />}
    {tab === "achievements" && <AchievementsView stats={props.stats} achievements={props.achievements} onNavigate={props.onNavigate} />}
    {tab === "settings" && <SettingsView email={props.email} displayName={props.displayName} onSaveProfile={props.onSaveProfile} onSignOut={props.onSignOut} onAccountDeleted={props.onAccountDeleted} sapaEnabled={props.sapaEnabled} sapaSaving={props.sapaSaving} onToggleSapa={props.onToggleSapa} />}
    {tab === "help" && <HelpView onNavigate={props.onNavigate} />}
  </div>;
}
