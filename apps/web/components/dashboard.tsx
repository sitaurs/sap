"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FilePlus2,
  FileText,
  Flame,
  Info,
  Instagram,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Menu,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Star,
  Trophy,
  UploadCloud,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import styles from "./dashboard.module.css";
import DashboardViews from "./dashboard-views";
import AdminPanel from "./admin-panel";
import BrandLogo from "./brand-logo";
import LoadingScreen from "./loading-screen";
import MediaThumbnail from "./media-thumbnail";
import SapaPet, { type SapaDashboardTab } from "./sapa-pet";
import type { SapaActivity, SapaActivityPhase } from "./sapa-motion-data";
import type { ReportSummary } from "./report-wizard";
import { saveSapaAccountPreference } from "./sapa-client";
import { ApiError, getAchievements, getMe, getStats, listCategories, listReports, listScans, logout, updateProfile, type SapAchievement, type SapCategory, type SapReport, type SapScan, type SapStats, type SapUser } from "../lib/api/client";

const InstagramPublication = dynamic(() => import("./instagram/publication-page"), {
  loading: () => <div role="status" style={{ padding: 32, color: "#647e98" }}>Memuat publikasi Instagram…</div>,
});

type AdminTab = "admin-moderation" | "admin-settings" | "admin-instagram";
type Tab = "dashboard" | "scan" | "reports" | "map" | "history" | "achievements" | "settings" | "help" | AdminTab;
const ADMIN_TABS: AdminTab[] = ["admin-moderation", "admin-settings", "admin-instagram"];
const isAdminTab = (tab: Tab): tab is AdminTab => (ADMIN_TABS as string[]).includes(tab);
const mainNav: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "scan", label: "Scan", icon: Camera },
  { id: "reports", label: "Laporan saya", icon: FileText },
  { id: "map", label: "Peta area", icon: Map },
  { id: "history", label: "Riwayat scan", icon: Clock3 },
  { id: "achievements", label: "Pencapaian", icon: Trophy },
];
const adminNav: { id: AdminTab; label: string; icon: LucideIcon }[] = [
  { id: "admin-moderation", label: "Moderasi laporan", icon: ShieldCheck },
  { id: "admin-settings", label: "Pengaturan scan", icon: Sliders },
  { id: "admin-instagram", label: "Publikasi Instagram", icon: Instagram },
];
const otherNav: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "settings", label: "Pengaturan", icon: Settings },
  { id: "help", label: "Bantuan", icon: CircleHelp },
];
const allTabs = new Set<Tab>([...mainNav, ...adminNav, ...otherNav].map(item => item.id));

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function EmptyArt() {
  return (
    <svg className={styles.emptyArt} viewBox="0 0 380 215" fill="none" aria-hidden="true">
      <path d="M25 174c24-20 53-20 78-8 10-36 43-50 70-31 18-25 51-22 65 4 31-16 59 2 65 28 18-8 42-7 58 7H25Z" fill="#EDF5F8" />
      <path d="M42 179c71-22 111-29 149-22 55-12 110-5 153 22H42Z" fill="#DDEEE7" />
      <path d="M195 117c-6-35-1-55 7-73m-6 73c-23-7-37-18-41-40m42 38c14-20 29-28 48-29" stroke="#83AF9F" strokeWidth="4" strokeLinecap="round" />
      <path d="M202 49c-16-13-18-29-12-45 14 9 21 26 12 45Zm-45 33c-20 1-31-13-33-33 19 1 32 14 33 33Zm85 5c5-24 22-39 46-42-2 23-19 39-46 42Z" fill="#A8CBBB" />
      <path d="m127 132 62-25 65 25-64 29-63-29Z" fill="#A9C9BD" />
      <path d="m127 132 63 29v42l-63-26v-45Z" fill="#BCD7CB" />
      <path d="m190 161 64-29v45l-64 26v-42Z" fill="#91B9A8" />
      <path d="m127 132 32-17 31 46-48-7-15-22Zm127 0-31-17-33 46 48-7 16-22Z" fill="#D7E8DF" />
      <path d="M107 47 98 36m42-17-1-15m45 16 9-12" stroke="#91B2A5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ label, value, icon: Icon, tone, onClick }: { label: string; value: string; icon: LucideIcon; tone: string; onClick: () => void }) {
  return <button className={`${styles.statCard} ${styles[tone]}`} type="button" onClick={onClick}>
    <span className={styles.statIcon}><Icon size={30} strokeWidth={2.2} /></span>
    <span className={styles.statText}><span>{label}</span><strong>{value}</strong></span>
    <span className={styles.statGhost}><Icon size={82} strokeWidth={1.3} /></span>
  </button>;
}

export default function Dashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<SapUser | null>(null);
  const [stats, setStats] = useState<SapStats | null>(null);
  const [scans, setScans] = useState<SapScan[]>([]);
  const [reports, setReports] = useState<SapReport[]>([]);
  const [achievements, setAchievements] = useState<SapAchievement[]>([]);
  const [categories, setCategories] = useState<SapCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [sapaEnabled, setSapaEnabled] = useState(false);
  const [sapaSaving, setSapaSaving] = useState(false);
  const [sapaActivity, setSapaActivity] = useState<SapaActivity>({ id: 0, phase: "idle" });
  const [reportWizardOpen, setReportWizardOpen] = useState(false);
  const [reportComposerRequested, setReportComposerRequested] = useState(false);

  const setPetActivity = useCallback((phase: SapaActivityPhase) => {
    setSapaActivity(current => ({ id: current.id + 1, phase }));
  }, []);
  useEffect(() => {
    if (sapaActivity.phase !== "success" && sapaActivity.phase !== "error") return;
    const timer = setTimeout(() => {
      setSapaActivity(current => current.id === sapaActivity.id ? { ...current, phase: "idle" } : current);
    }, 1800);
    return () => clearTimeout(timer);
  }, [sapaActivity.id, sapaActivity.phase]);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view") as Tab | null;
    if (requestedView && allTabs.has(requestedView)) setTab(requestedView);
    const controller = new AbortController();
    void refreshData(controller.signal);
    return () => controller.abort();
  }, []);

  async function refreshData(signal?: AbortSignal) {
    setLoadError("");
    try {
      const account = await getMe(signal);
      const [nextStats, scanPage, reportPage, achievementPage, categoryPage] = await Promise.all([
        getStats(signal), listScans(signal), listReports(signal), getAchievements(signal), listCategories(signal),
      ]);
      if (signal?.aborted) return;
      setUser(account); setStats(nextStats); setScans(scanPage.items); setReports(reportPage.items);
      setAchievements(achievementPage.items); setCategories(categoryPage.items); setSapaEnabled(account.sapaEnabled);
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) { router.replace("/login"); return; }
      setLoadError(cause instanceof Error ? cause.message : "Data dashboard belum dapat dimuat.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  const categoryName = (id: string | null) => categories.find(item => item.id === id)?.name || id || "Belum dikenali";
  const counts = useMemo(() => (stats?.categoryCounts || []).filter(item => item.count > 0).map(item => ({ name: categories.find(category => category.id === item.categoryId)?.name || item.categoryId, count: item.count })), [stats, categories]);
  const displayName = user?.displayName || "Pengguna";
  const filteredScans = scans.filter(scan => `${categoryName(scan.categoryId)} ${scan.status}`.toLowerCase().includes(search.toLowerCase()));
  const filteredReports = reports.filter(report => `${categoryName(report.categoryId)} ${report.description} ${report.status}`.toLowerCase().includes(search.toLowerCase()));

  function openTab(next: Tab) {
    if (next !== tab) setPetActivity("idle");
    setTab(next);
    setReportWizardOpen(false);
    setReportComposerRequested(false);
    const url = new URL(window.location.href);
    if (next === "dashboard") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (next !== "admin-instagram") url.searchParams.delete("publication");
    window.history.replaceState(null, "", url);
    setMobileMenu(false);
    setProfileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openReportFromScan() {
    openTab("reports");
    setReportComposerRequested(true);
    setReportWizardOpen(true);
  }

  function reportSubmitted(_summary: ReportSummary) {
    setPetActivity("success");
    void refreshData();
    setToast("Laporan berhasil dikirim dan menunggu pemeriksaan admin.");
  }

  async function signOut() {
    try { await logout(); }
    catch (cause) { setToast(cause instanceof Error ? cause.message : "Belum berhasil keluar."); return; }
    setUser(null); setStats(null); setScans([]); setReports([]); setAchievements([]);
    router.replace("/login");
  }

  async function saveProfile(name: string) {
    const account = await updateProfile(name);
    setUser(account);
    setToast("Profil tersimpan di akun SAP Anda.");
  }

  function avatarChanged(account: SapUser) {
    setUser(account);
    setToast(account.avatarMediaId ? "Foto profil diperbarui." : "Foto profil dihapus.");
  }

  async function toggleSapa() {
    if (sapaSaving) return;
    const previous = sapaEnabled;
    const next = !previous;
    setSapaEnabled(next);
    setSapaSaving(true);
    try {
      await saveSapaAccountPreference(next);
    } catch (cause) {
      setSapaEnabled(previous);
      setToast(cause instanceof Error ? cause.message : "Preferensi SAPA belum tersimpan.");
    } finally {
      setSapaSaving(false);
    }
  }

  if (loading || (!user && !loadError)) return <LoadingScreen message="Memuat ruang kerja SAP…" />;
  if (loadError) return <div className={styles.loadingScreen} role="alert"><BrandLogo width={165} /><strong>Ruang kerja belum dapat dimuat</strong><span>{loadError}</span><button className={styles.primaryButton} type="button" onClick={() => { setLoading(true); void refreshData(); }}>Coba lagi</button></div>;

  return <div className={styles.shell}>
    {mobileMenu && <button className={styles.mobileShade} type="button" onClick={() => setMobileMenu(false)} aria-label="Tutup navigasi" />}
    <aside className={`${styles.sidebar} ${mobileMenu ? styles.sidebarOpen : ""}`}>
      <Link className={styles.brand} href="/" aria-label="SAP, kembali ke beranda"><BrandLogo width={165} /></Link>
      <div className={styles.sideLabel}>MENU</div>
      <nav className={styles.sideNav} aria-label="Navigasi dashboard">
        {mainNav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${styles.navItem} ${tab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={23} /><span>{label}</span></button>)}
      </nav>
      {user?.role === "admin" && <>
        <div className={styles.sideDivider} />
        <div className={styles.sideLabel}>ADMIN</div>
        <nav className={styles.sideNav} aria-label="Admin">
          {adminNav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${styles.navItem} ${tab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={23} /><span>{label}</span></button>)}
        </nav>
      </>}
      <div className={styles.sideDivider} />
      <div className={styles.sideLabel}>LAINNYA</div>
      <nav className={styles.sideNav} aria-label="Lainnya">
        {otherNav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${styles.navItem} ${tab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={tab === id ? "page" : undefined}><Icon size={23} /><span>{label}</span></button>)}
        <button className={styles.navItem} type="button" onClick={signOut}><LogOut size={23} /><span>Keluar</span></button>
      </nav>
      <div className={styles.sideGarden} aria-hidden="true" />
    </aside>

    <div className={styles.mainColumn}>
      <header className={styles.topbar}>
        <button className={styles.menuButton} type="button" onClick={() => setMobileMenu(true)} aria-label="Buka menu"><Menu size={24} /></button>
        <div className={styles.searchBox}><Search size={22} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari laporan atau area" aria-label="Cari laporan atau area" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Hapus pencarian"><X size={18} /></button>}
          {search && <div className={styles.searchResults}>
            <strong>Hasil pencarian lokal</strong>
            {filteredScans.length === 0 && filteredReports.length === 0 ? <p>Belum ada hasil yang cocok di aktivitas Anda.</p> : <>
              {filteredReports.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => { openTab("reports"); setSearch(""); }}><FileText size={17} /><span>Laporan {categoryName(item.categoryId)}<small>{item.description}</small></span></button>)}
              {filteredScans.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => { openTab("history"); setSearch(""); }}><ScanLine size={17} /><span>{categoryName(item.categoryId)}<small>{item.status}</small></span></button>)}
            </>}
          </div>}
        </div>
        <div className={styles.headerTools}>
          <div className={styles.popoverAnchor}><button className={styles.profileButton} type="button" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label={`Buka menu akun ${displayName}`}><span className={styles.avatar}>{user?.avatarMediaId ? <MediaThumbnail mediaId={user.avatarMediaId} alt={`Foto profil ${displayName}`} className={styles.headerAvatarPhoto} fallback={<UserRound size={21} aria-hidden="true" />} /> : <UserRound size={21} aria-hidden="true" />}</span><span>{displayName}</span><ChevronDown size={18} /></button>{profileOpen && <div className={styles.popover}><strong>Akun SAP</strong><p>{user?.email}</p><button className={styles.popoverAction} type="button" onClick={() => openTab("settings")}>Pengaturan</button><button className={styles.popoverAction} type="button" onClick={() => void signOut()}>Keluar</button></div>}</div>
        </div>
      </header>

      <main className={styles.content}>
        {tab === "dashboard" && <>
          <div className={styles.pageHeading}><div><p className={styles.kicker}><span /> RUANG KERJA ANDA</p><h1>Dashboard</h1><p>Pantau aktivitas scan dan laporan Anda.</p></div><div className={styles.quickActions}><button className={styles.primaryButton} type="button" onClick={() => openTab("scan")}><Camera size={22} strokeWidth={2.2} />Scan sampah</button><button className={styles.outlineButton} type="button" onClick={openReportFromScan}><FilePlus2 size={22} />Buat laporan</button></div></div>
          <div className={styles.statGrid}>
            <StatCard label="Total scan" value={String(stats?.totalScans ?? 0)} icon={ScanLine} tone="green" onClick={() => openTab("history")} />
            <StatCard label="Laporan saya" value={String(reports.length)} icon={FileText} tone="blue" onClick={() => openTab("reports")} />
            <StatCard label="Poin" value={String(stats?.ecoPoints ?? 0)} icon={Star} tone="gold" onClick={() => openTab("achievements")} />
            <StatCard label="Streak" value={`${stats?.streakDays ?? 0} hari`} icon={Flame} tone="indigo" onClick={() => openTab("achievements")} />
          </div>
          <div className={styles.overviewGrid}>
            <section className={`${styles.panel} ${styles.categoryPanel}`}><div className={styles.panelTitle}><LayoutDashboard size={22} /><h2>Hasil scan per kategori</h2></div>
              {counts.length ? <div className={styles.categoryBreakdown}>{counts.map(item => <button key={item.name} type="button" onClick={() => openTab("history")}><span className={styles.categoryName}>{item.name}</span><span className={styles.barTrack}><span style={{ width: `${Math.max(12, item.count / Math.max(1, stats?.classifiedScans ?? 0) * 100)}%` }} /></span><strong>{item.count}</strong></button>)}<p>Berdasarkan scan yang berhasil dikenali.</p></div> : <div className={styles.emptyCategory}><EmptyArt /><p>Kategori sampah akan muncul<br />setelah AI mengenali foto Anda.</p><button className={styles.primaryButton} type="button" onClick={() => openTab("scan")}><Camera size={21} strokeWidth={2.2} />Scan sampah</button></div>}
            </section>
            <div className={styles.rightPanels}>
              <section className={`${styles.panel} ${styles.recentPanel}`}><div className={styles.panelTitle}><FileText size={22} /><h2>Laporan terbaru</h2></div>{reports.length ? <div className={styles.recentList}>{reports.slice(0, 2).map(item => <button type="button" key={item.id} onClick={() => openTab("reports")}><span className={styles.reportIcon}><FileText size={20} /></span><span><strong>Laporan {categoryName(item.categoryId)}</strong><small>{item.status} · {formatDate(item.createdAt)}</small></span><ArrowRight size={17} /></button>)}</div> : <div className={styles.emptyRecent}><FileText size={45} /><p>Belum ada laporan.</p><button type="button" onClick={() => openTab("reports")}>Buat laporan pertama <ArrowRight size={16} /></button></div>}</section>
              <section className={`${styles.panel} ${styles.mapPanel}`}><div className={styles.panelTitle}><Map size={22} /><h2>Peta area</h2></div><button className={styles.mapPreview} type="button" onClick={() => openTab("map")} aria-label="Buka peta area"><Image src="/images/dashboard/map-preview.webp" alt="Ilustrasi peta area dengan sungai, jalan, dan ruang hijau" fill sizes="(max-width: 900px) 100vw, 42vw" /><span>Lihat peta <ArrowRight size={16} /></span></button><p className={styles.mapNote}><Info size={18} /> Area tanpa laporan terverifikasi ditampilkan sebagai belum ada data.</p></section>
            </div>
          </div>
        </>}

        {tab !== "dashboard" && !isAdminTab(tab) && <DashboardViews key={tab} tab={tab} scans={scans} reports={reports} stats={stats} achievements={achievements} categories={categories} email={user?.email || ""} displayName={displayName} avatarMediaId={user?.avatarMediaId ?? null} onNavigate={openTab} onScanFinished={() => void refreshData()} onScanActivity={setPetActivity} onOpenReport={openReportFromScan} reportComposerRequested={reportComposerRequested} onReportSubmitted={reportSubmitted} onReportsChanged={() => void refreshData()} onReportWizardChange={setReportWizardOpen} onSaveProfile={saveProfile} onAvatarChanged={avatarChanged} onSignOut={signOut} onAccountDeleted={() => { setUser(null); setStats(null); setScans([]); setReports([]); router.replace("/login"); }} sapaEnabled={sapaEnabled} sapaSaving={sapaSaving} onToggleSapa={toggleSapa} />}

        {isAdminTab(tab) && (user?.role === "admin"
          ? tab === "admin-instagram" ? <InstagramPublication categories={categories} onModeration={() => openTab("admin-moderation")} /> : <div className={`${styles.subPage} ${styles.referenceView}`}>
              <div className={styles.referenceHeading}>
                <h1>{tab === "admin-settings" ? "Pengaturan scan" : "Moderasi laporan"}</h1>
                <p>{tab === "admin-settings" ? "Atur strategi deteksi hybrid ML → vision LLM." : "Periksa, verifikasi, dan tindak lanjuti laporan warga."}</p>
              </div>
              <AdminPanel section={tab === "admin-settings" ? "settings" : "moderation"} categories={categories} />
            </div>
          : <div className={`${styles.subPage} ${styles.referenceView}`}><div className={styles.referenceHeading}><h1>Akses ditolak</h1><p>Halaman ini hanya untuk admin.</p></div></div>)}

      </main>
    </div>
    {sapaEnabled && !reportWizardOpen && <SapaPet tab={isAdminTab(tab) ? "dashboard" : (tab satisfies SapaDashboardTab)} backendLinked activity={sapaActivity} onNavigate={openTab} />}
    {toast && <div className={styles.toast} role="status"><Sparkles size={18} /><span>{toast}</span><button type="button" onClick={() => setToast("")} aria-label="Tutup pesan"><X size={16} /></button></div>}
  </div>;
}
