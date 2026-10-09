"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  FilePlus2,
  FileText,
  Flame,
  Info,
  LayoutDashboard,
  LogOut,
  Map,
  ScanLine,
  Search,
  Sparkles,
  Star,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import styles from "./dashboard.module.css";
import DashboardViews from "./dashboard-views";
import AdminPanel from "./admin-panel";
import AdminCommunityReview from "./community/admin-community-review";
import BrandLogo from "./brand-logo";
import LoadingScreen from "./loading-screen";
import MediaThumbnail from "./media-thumbnail";
import SapaPet, { type SapaDashboardTab } from "./sapa-pet";
import type { SapaActivity, SapaActivityPhase } from "./sapa-motion-data";
import MobileAccountMenu, { MobileAdminMenu } from "./mobile/mobile-account-menu";
import MobileBottomNav from "./mobile/mobile-bottom-nav";
import MobileHeader from "./mobile/mobile-header";
import { adminNav, mainNav, otherNav, isAdminTab, isMobileMenuTab, requestedDashboardTab, type DashboardTab } from "./mobile/navigation-data";
import { useMobileNavigation } from "./mobile/use-mobile-navigation";
import { loginDestination } from "../lib/auth-return";
import type { ReportSummary } from "./report-wizard";
import { saveSapaAccountPreference } from "./sapa-client";
import { ApiError, getAchievements, getMe, getStats, listCategories, listReports, listScans, logout, updateProfile, type SapAchievement, type SapCategory, type SapReport, type SapScan, type SapStats, type SapUser } from "../lib/api/client";
import { useI18n, UiText } from "../lib/i18n/provider";
import AnimatedNumber from "./motion/animated-number";


const InstagramPublication = dynamic(() => import("./instagram/publication-page"), {
  loading: () => <div role="status" style={{ padding: 32, color: "#647e98" }}><UiText source="Memuat publikasi Instagram…" /></div>,
});
const ActivitiesPage = dynamic(() => import("./activities/activities-page"), {
  loading: () => <div role="status" style={{ padding: 32, color: "#647e98" }}><UiText source="Memuat kegiatan relawan…" /></div>,
});
const VolunteerActivitiesPage = dynamic(() => import("./activities/volunteer-activities-page"), {
  loading: () => <div role="status" style={{ padding: 32, color: "#647e98" }}><UiText source="Memuat ruang relawan…" /></div>,
});
const ImpactPage = dynamic(() => import("./impact/impact-page"), {
  loading: () => <div role="status" style={{ padding: 32, color: "#647e98" }}><UiText source="Memuat dampak…" /></div>,
});

type Tab = DashboardTab;

function readDashboardTab(): Tab {
  const url = new URL(window.location.href);
  const next = requestedDashboardTab(url.search);
  if (url.searchParams.get("view") === "admin-reviews") {
    url.searchParams.set("view", "admin-moderation");
    window.history.replaceState(window.history.state, "", url);
  } else if (url.searchParams.get("view") === "community") {
    url.searchParams.delete("view");
    url.searchParams.delete("community");
    window.history.replaceState(window.history.state, "", url);
  }
  return next;
}

function formatDate(value: string, locale = "id-ID") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
  const { t } = useI18n();
  return <button data-motion="card" className={`${styles.statCard} ${styles[tone]}`} type="button" onClick={onClick}>
    <span className={styles.statIcon}><Icon size={30} strokeWidth={2.2} /></span>
    <span className={styles.statText}><span>{t(label)}</span><strong><AnimatedNumber value={value} /></strong></span>
    <span className={styles.statGhost}><Icon size={82} strokeWidth={1.3} /></span>
  </button>;
}

export default function Dashboard() {
  const { t, intlLocale } = useI18n();
  const router = useRouter();
  const mobile = useMobileNavigation();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [signingOut, setSigningOut] = useState(false);
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
    setTab(readDashboardTab());
    const controller = new AbortController();
    void refreshData(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const restoreView = () => {
      setTab(readDashboardTab());
      setProfileOpen(false);
      setMobileSearchOpen(false);
      setReportWizardOpen(false);
      setReportComposerRequested(false);
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);
  useEffect(() => { if (mobileSearchOpen) searchInputRef.current?.focus(); }, [mobileSearchOpen]);

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
      if (cause instanceof ApiError && cause.status === 401) { router.replace(loginDestination(window.location.pathname + window.location.search)); return; }
      setLoadError(cause instanceof Error ? cause.message : "Data dashboard belum dapat dimuat.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  const categoryName = (id: string | null) => t(categories.find(item => item.id === id)?.name || id || "Belum dikenali");
  const counts = useMemo(() => (stats?.categoryCounts || []).filter(item => item.count > 0).map(item => ({ name: categories.find(category => category.id === item.categoryId)?.name || item.categoryId, count: item.count })), [stats, categories]);
  const displayName = user?.displayName || "Pengguna";
  // Resizing back to desktop restores its existing settings/moderation screens.
  const activeTab = !mobile && tab === "account" ? "settings" : !mobile && tab === "admin-menu" ? "admin-moderation" : tab;
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
    url.searchParams.delete("community");
    if (next !== "admin-instagram") url.searchParams.delete("publication");
    if (next !== "admin-activities") {
      url.searchParams.delete("activity");
      url.searchParams.delete("activityScreen");
      url.searchParams.delete("result");
    }
    if (mobile && next !== tab) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    setMobileSearchOpen(false);
    setProfileOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      setUser(null); setStats(null); setScans([]); setReports([]); setAchievements([]);
      router.replace("/login");
    } catch (cause) { setToast(cause instanceof Error ? cause.message : "Belum berhasil keluar."); }
    finally { setSigningOut(false); }
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

  if (loading || (!user && !loadError)) return <LoadingScreen message={t("Memuat ruang kerja SAP…")} />;
  if (loadError) return <div className={styles.loadingScreen} role="alert"><BrandLogo width={165} /><strong>{t("Ruang kerja belum dapat dimuat")}</strong><span>{t(loadError)}</span><button className={styles.primaryButton} type="button" onClick={() => { setLoading(true); void refreshData(); }}>{t("Coba lagi")}</button></div>;

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/" aria-label={t("SAP, kembali ke beranda")}><BrandLogo width={165} /></Link>
      <div className={styles.sideLabel}>{t("MENU")}</div>
      <nav className={styles.sideNav} aria-label={t("Navigasi dashboard")}>
        {mainNav.map(({ id, label, icon: Icon }) => <button data-motion-nav key={id} type="button" className={`${styles.navItem} ${activeTab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={activeTab === id ? "page" : undefined}><Icon size={23} /><span>{t(label)}</span></button>)}
      </nav>
      {user?.role === "admin" && <>
        <div className={styles.sideDivider} />
        <div className={styles.sideLabel}>{t("ADMIN")}</div>
        <nav className={styles.sideNav} aria-label={t("Admin")}>
          {adminNav.map(({ id, label, icon: Icon }) => <button data-motion-nav key={id} type="button" className={`${styles.navItem} ${activeTab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={activeTab === id ? "page" : undefined}><Icon size={23} /><span>{t(label)}</span></button>)}
        </nav>
      </>}
      <div className={styles.sideDivider} />
      <div className={styles.sideLabel}>{t("LAINNYA")}</div>
      <nav className={styles.sideNav} aria-label={t("Lainnya")}>
        {otherNav.map(({ id, label, icon: Icon }) => <button data-motion-nav key={id} type="button" className={`${styles.navItem} ${activeTab === id ? styles.navActive : ""}`} onClick={() => openTab(id)} aria-current={activeTab === id ? "page" : undefined}><Icon size={23} /><span>{t(label)}</span></button>)}
        <button className={styles.navItem} type="button" onClick={signOut}><LogOut size={23} /><span>{t("Keluar")}</span></button>
      </nav>
      <div className={styles.sideGarden} aria-hidden="true" />
    </aside>

    <div className={styles.mainColumn}>
      <header className={styles.topbar}>
        <MobileHeader displayName={displayName} avatarMediaId={user?.avatarMediaId ?? null} searchOpen={mobileSearchOpen} onSearch={() => setMobileSearchOpen(value => !value)} onHome={() => openTab("dashboard")} onAccount={() => openTab("account")} />
        <div id="dashboard-search" className={`${styles.searchBox} ${mobileSearchOpen ? styles.mobileSearchVisible : ""}`}><Search size={22} /><input ref={searchInputRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Cari laporan atau area")} aria-label={t("Cari laporan atau area")} />{search && <button type="button" onClick={() => setSearch("")} aria-label={t("Hapus pencarian")}><X size={18} /></button>}
          {search && <div className={styles.searchResults}>
            <strong>{t("Hasil pencarian lokal")}</strong>
            {filteredScans.length === 0 && filteredReports.length === 0 ? <p>{t("Belum ada hasil yang cocok di aktivitas Anda.")}</p> : <>
              {filteredReports.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => { openTab("reports"); setSearch(""); }}><FileText size={17} /><span>{t("Laporan")}{" "}{t(categoryName(item.categoryId))}<small>{item.description}</small></span></button>)}
              {filteredScans.slice(0, 3).map(item => <button key={item.id} type="button" onClick={() => { openTab("history"); setSearch(""); }}><ScanLine size={17} /><span>{t(categoryName(item.categoryId))}<small>{item.status}</small></span></button>)}
            </>}
          </div>}
        </div>
        <div className={styles.headerTools}>
          <div className={styles.popoverAnchor}><button className={styles.profileButton} type="button" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label={t("Buka menu akun {0}", { "0": displayName })}><span className={styles.avatar}>{user?.avatarMediaId ? <MediaThumbnail mediaId={user.avatarMediaId} alt={t("Foto profil {0}", { "0": displayName })} className={styles.headerAvatarPhoto} fallback={<UserRound size={21} aria-hidden="true" />} /> : <UserRound size={21} aria-hidden="true" />}</span><span>{displayName}</span><ChevronDown size={18} /></button>{profileOpen && <div data-motion="feedback" className={styles.popover}><strong>{t("Akun SAP")}</strong><p>{user?.email}</p><button className={styles.popoverAction} type="button" onClick={() => openTab("settings")}>{t("Pengaturan")}</button><button className={styles.popoverAction} type="button" onClick={() => void signOut()}>{t("Keluar")}</button></div>}</div>
        </div>
      </header>

      <main className={styles.content} data-motion-scope data-motion-view={activeTab}>
        {mobile && isAdminTab(activeTab) && <button
          type="button"
          className={styles.mobileAdminBack}
          onClick={() => openTab("admin-menu")}
        >
          <ArrowLeft size={20} aria-hidden="true" />
          <span>{t("Kembali ke pusat admin")}</span>
        </button>}
        {mobile && tab === "account" && user && <MobileAccountMenu user={user} onNavigate={openTab} onSignOut={() => void signOut()} signingOut={signingOut} />}
        {mobile && tab === "admin-menu" && <MobileAdminMenu isAdmin={user?.role === "admin"} onNavigate={openTab} />}
        {activeTab === "dashboard" && <>
          <div data-motion="heading" className={styles.pageHeading}><div><p className={styles.kicker}><span /> {" "}{t("RUANG KERJA ANDA")}</p><h1>{t("Dashboard")}</h1><p>{t("Pantau aktivitas scan dan laporan Anda.")}</p></div><div className={styles.quickActions}><button className={styles.primaryButton} type="button" onClick={() => openTab("scan")}><Camera size={22} strokeWidth={2.2} />{t("Scan sampah")}</button><button className={styles.outlineButton} type="button" onClick={openReportFromScan}><FilePlus2 size={22} />{t("Buat laporan")}</button></div></div>
          <div className={styles.statGrid}>
            <StatCard label={t("Total scan")} value={String(stats?.totalScans ?? 0)} icon={ScanLine} tone="green" onClick={() => openTab("history")} />
            <StatCard label={t("Laporan saya")} value={String(reports.length)} icon={FileText} tone="blue" onClick={() => openTab("reports")} />
            <StatCard label={t("Poin")} value={String(stats?.ecoPoints ?? 0)} icon={Star} tone="gold" onClick={() => openTab("achievements")} />
            <StatCard label={t("Streak")} value={`${stats?.streakDays ?? 0} hari`} icon={Flame} tone="indigo" onClick={() => openTab("achievements")} />
          </div>
          <div className={styles.overviewGrid}>
            <section className={`${styles.panel} ${styles.categoryPanel}`}><div className={styles.panelTitle}><LayoutDashboard size={22} /><h2>{t("Hasil scan per kategori")}</h2></div>
              {counts.length ? <div className={styles.categoryBreakdown}>{counts.map(item => <button key={item.name} type="button" onClick={() => openTab("history")}><span className={styles.categoryName}>{t(item.name)}</span><span className={styles.barTrack}><span data-motion="chart" style={{ width: `${Math.max(12, item.count / Math.max(1, stats?.classifiedScans ?? 0) * 100)}%` }} /></span><strong>{item.count}</strong></button>)}<p>{t("Berdasarkan scan yang berhasil dikenali.")}</p></div> : <div className={styles.emptyCategory}><EmptyArt /><p>{t("Kategori sampah akan muncul")}<br />{t("setelah AI mengenali foto Anda.")}</p><button className={styles.primaryButton} type="button" onClick={() => openTab("scan")}><Camera size={21} strokeWidth={2.2} />{t("Scan sampah")}</button></div>}
            </section>
            <div className={styles.rightPanels}>
              <section className={`${styles.panel} ${styles.recentPanel}`}><div className={styles.panelTitle}><FileText size={22} /><h2>{t("Laporan terbaru")}</h2></div>{reports.length ? <div className={styles.recentList}>{reports.slice(0, 2).map(item => <button type="button" key={item.id} onClick={() => openTab("reports")}><span className={styles.reportIcon}><FileText size={20} /></span><span><strong>{t("Laporan")}{" "}{t(categoryName(item.categoryId))}</strong><small>{item.status} · {formatDate(item.createdAt, intlLocale)}</small></span><ArrowRight size={17} /></button>)}</div> : <div className={styles.emptyRecent}><FileText size={45} /><p>{t("Belum ada laporan.")}</p><button type="button" onClick={() => openTab("reports")}>{t("Buat laporan pertama")}{" "}<ArrowRight size={16} /></button></div>}</section>
              <section className={`${styles.panel} ${styles.mapPanel}`}><div className={styles.panelTitle}><Map size={22} /><h2>{t("Peta area")}</h2></div><button className={styles.mapPreview} type="button" onClick={() => openTab("map")} aria-label={t("Buka peta area")}><Image src="/images/dashboard/map-preview.webp" alt={t("Ilustrasi peta area dengan sungai, jalan, dan ruang hijau")} fill sizes="(max-width: 900px) 100vw, 42vw" /><span>{t("Lihat peta")}{" "}<ArrowRight size={16} /></span></button><p className={styles.mapNote}><Info size={18} /> {" "}{t("Area tanpa laporan terverifikasi ditampilkan sebagai belum ada data.")}</p></section>
            </div>
          </div>
        </>}

        {activeTab === "activities" && <VolunteerActivitiesPage categories={categories} />}
        {activeTab !== "dashboard" && activeTab !== "account" && activeTab !== "admin-menu" && activeTab !== "activities" && !isAdminTab(activeTab) && <DashboardViews key={activeTab} tab={activeTab} scans={scans} reports={reports} stats={stats} achievements={achievements} categories={categories} email={user?.email || ""} displayName={displayName} avatarMediaId={user?.avatarMediaId ?? null} onNavigate={openTab} onScanFinished={() => void refreshData()} onScanActivity={setPetActivity} onOpenReport={openReportFromScan} reportComposerRequested={reportComposerRequested} onReportSubmitted={reportSubmitted} onReportsChanged={() => void refreshData()} onReportWizardChange={setReportWizardOpen} onSaveProfile={saveProfile} onAvatarChanged={avatarChanged} onSignOut={signOut} onAccountDeleted={() => { setUser(null); setStats(null); setScans([]); setReports([]); router.replace("/login"); }} sapaEnabled={sapaEnabled} sapaSaving={sapaSaving} onToggleSapa={toggleSapa} />}

        {isAdminTab(activeTab) && (user?.role === "admin"
          ? activeTab === "admin-instagram" ? <InstagramPublication categories={categories} onModeration={() => openTab("admin-moderation")} /> : activeTab === "admin-community" ? <AdminCommunityReview /> : activeTab === "admin-activities" ? <ActivitiesPage categories={categories} /> : activeTab === "admin-impact" ? <ImpactPage /> : <div className={`${styles.subPage} ${styles.referenceView}`}>
              <div data-motion="heading" className={styles.referenceHeading}>
                <h1>{activeTab === "admin-settings" ? t("Pengaturan scan") : t("Moderasi laporan")}</h1>
                <p>{activeTab === "admin-settings" ? t("Atur strategi deteksi hybrid ML → vision LLM.") : t("Periksa, verifikasi, dan tindak lanjuti laporan warga.")}</p>
              </div>
              <AdminPanel section={activeTab === "admin-settings" ? "settings" : "moderation"} categories={categories} />
            </div>
          : <div className={`${styles.subPage} ${styles.referenceView}`}><div data-motion="heading" className={styles.referenceHeading}><h1>{t("Akses ditolak")}</h1><p>{t("Halaman ini hanya untuk admin.")}</p></div></div>)}

      </main>
    </div>
    {!reportWizardOpen && <MobileBottomNav tab={tab} sapaEnabled={sapaEnabled} onNavigate={openTab} />}
    {sapaEnabled && !reportWizardOpen && <SapaPet tab={isAdminTab(activeTab) || isMobileMenuTab(activeTab) || activeTab === "activities" ? "dashboard" : (activeTab satisfies SapaDashboardTab)} backendLinked activity={sapaActivity} onNavigate={openTab} mobileDock />}
    {toast && <div data-motion="feedback" className={styles.toast} role="status"><Sparkles size={18} /><span>{t(toast)}</span><button type="button" onClick={() => setToast("")} aria-label={t("Tutup pesan")}><X size={16} /></button></div>}
  </div>;
}
