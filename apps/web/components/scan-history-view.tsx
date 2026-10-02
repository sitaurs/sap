"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowRight, CalendarDays, Camera,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, FileText,
  Filter, Info, Leaf, LoaderCircle, MapPin,
  RefreshCw, Search, Tag, X, XCircle,
} from "lucide-react";
import { getScan, type SapCategory, type SapScan } from "../lib/api/client";
import styles from "./scan-history-view.module.css";
import MediaThumbnail from "./media-thumbnail";

type Tab = "dashboard" | "scan" | "reports" | "map" | "history" | "achievements" | "settings" | "help";
type Props = {
  scans: SapScan[];
  categories: SapCategory[];
  onNavigate: (tab: Tab) => void;
  onOpenReport: () => void;
};
type HistoryFilter = "all" | "recognized" | "unrecognized";
const filters: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "Semua" }, { id: "recognized", label: "Dikenali" },
  { id: "unrecognized", label: "Belum dikenali" },
];
const categoryLabels: Record<string, string> = {
  battery: "Baterai", biological: "Organik", cardboard: "Kardus", clothes: "Pakaian",
  glass: "Kaca", metal: "Logam", paper: "Kertas", plastic: "Plastik", shoes: "Sepatu", trash: "Residu",
};
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const dayFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
const displayTime = (value: string) => `${timeFormat.format(new Date(value)).replace(".", ":")} WIB`;
const recognized = (scan: SapScan) => scan.status === "succeeded" && scan.outcome === "classified";
const unrecognized = (scan: SapScan) => scan.status === "succeeded" && (scan.outcome === "unknown" || scan.outcome === "no_waste");
const pending = (scan: SapScan) => scan.status === "queued" || scan.status === "processing";

function categoryName(id: string | null, categories: SapCategory[]) {
  return categories.find(item => item.id === id)?.name || (id ? categoryLabels[id] || id : "Belum dikenali");
}
function scanTitle(scan: SapScan, categories: SapCategory[]) {
  if (scan.status === "failed") return "Pemindaian belum berhasil";
  if (pending(scan)) return "Sedang mengenali material";
  if (scan.outcome === "no_waste") return "Tidak ada sampah terdeteksi";
  return categoryName(scan.categoryId, categories);
}
function statusLabel(scan: SapScan) {
  if (scan.status === "failed") return "Gagal diproses";
  if (scan.status === "queued") return "Dalam antrean";
  if (scan.status === "processing") return "Sedang diproses";
  return "Selesai";
}
function ResultBadge({ scan }: { scan: SapScan }) {
  const known = recognized(scan);
  const Icon = known ? CheckCircle2 : pending(scan) ? Clock3 : scan.status === "failed" ? XCircle : CircleHelp;
  const label = known ? "Dikenali" : pending(scan) || scan.status === "failed" ? statusLabel(scan) : scan.outcome === "no_waste" ? "Tidak terdeteksi" : "Belum dikenali";
  return <span className={`${styles.badge} ${known ? styles.known : pending(scan) ? styles.pending : scan.status === "failed" ? styles.failed : styles.unknown}`}><Icon size={15} aria-hidden="true" />{label}</span>;
}
function CategoryArt({ scan, caption = false }: { scan: SapScan; caption?: boolean }) {
  return <MediaThumbnail mediaId={scan.mediaId} alt={`Foto unggahan scan #${scan.id.slice(0, 8)}`} caption={caption} className={styles.scanPhoto} />;
}

function Metadata({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className={styles.metadata}><span className={styles.iconTile}>{icon}</span><div><dt>{label}</dt><dd>{children}</dd></div></div>;
}

// Both the list and drawer resolve the actual owner-only uploaded scan media.
function ScanDetail({ initial, categories, onClose, onOpenReport, onScanAgain, onUpdate }: {
  initial: SapScan; categories: SapCategory[]; onClose: () => void;
  onOpenReport: () => void; onScanAgain: () => void; onUpdate: (scan: SapScan) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const tabsId = useId();
  const [scan, setScan] = useState(initial);
  const [tab, setTab] = useState<"summary" | "guide">("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const summaryTab = useRef<HTMLButtonElement>(null);
  const guideTab = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setError("");
    async function refresh() {
      try {
        const next = await getScan(initial.id, controller.signal);
        if (controller.signal.aborted) return;
        setScan(next); onUpdate(next); setError("");
        if (pending(next)) timer = setTimeout(() => void refresh(), 4000);
      } catch {
        if (!controller.signal.aborted) setError("Detail terbaru belum dapat dimuat. Informasi terakhir tetap ditampilkan.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [initial.id, attempt, onUpdate]);

  function chooseTab(next: "summary" | "guide") {
    setTab(next); (next === "summary" ? summaryTab : guideTab).current?.focus();
  }
  const errorMessages: Record<NonNullable<SapScan["errorCode"]>, string> = {
    ML_UNAVAILABLE: "Layanan pengenalan sedang tidak tersedia. Coba scan lagi nanti.",
    ML_TIMEOUT: "Pemindaian membutuhkan waktu terlalu lama. Coba scan ulang.",
    ML_INVALID_RESPONSE: "Hasil pengenalan belum dapat dibaca. Coba scan ulang.",
    MEDIA_INVALID: "Foto belum dapat diproses. Pilih foto lain yang jelas.",
  };
  return <dialog ref={dialog} className={styles.drawer} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target !== event.currentTarget) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); }}>
    <div className={styles.drawerLayout}>
      <header className={styles.drawerHeader}><div><span className={styles.eyebrow}>HASIL PEMINDAIAN</span><h2 id={titleId}>Detail pemindaian</h2><p>Ringkasan hasil pengenalan material.</p></div><button className={styles.close} type="button" onClick={onClose} aria-label="Tutup detail pemindaian"><X size={21} /></button></header>
      <div className={styles.drawerBody}>
        <section className={styles.identity}><CategoryArt scan={scan} caption /><div className={styles.identityCopy}><h3>{scanTitle(scan, categories)}</h3><ResultBadge scan={scan} /><span className={styles.scanId} title={scan.id}>Scan #{scan.id.slice(0, 8)}</span></div><Image className={styles.identityFoliage} src="/images/settings/profile-botanical.webp" alt="" width={170} height={170} /></section>
        <div className={styles.tabs} role="tablist" aria-label="Isi detail scan" onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); chooseTab(event.key === "Home" ? "summary" : event.key === "End" ? "guide" : tab === "summary" ? "guide" : "summary"); } }}>
          <button ref={summaryTab} id={`${tabsId}-summary`} type="button" role="tab" aria-selected={tab === "summary"} aria-controls={`${tabsId}-summary-panel`} tabIndex={tab === "summary" ? 0 : -1} onClick={() => setTab("summary")}>Ringkasan</button>
          <button ref={guideTab} id={`${tabsId}-guide`} type="button" role="tab" aria-selected={tab === "guide"} aria-controls={`${tabsId}-guide-panel`} tabIndex={tab === "guide" ? 0 : -1} onClick={() => setTab("guide")}>Panduan</button>
          {loading && <span className={styles.refreshing} role="status"><LoaderCircle className={styles.spin} size={16} />Memuat…</span>}
        </div>
        {error && <div className={styles.detailError} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Coba lagi</button></div>}
        <section id={`${tabsId}-summary-panel`} role="tabpanel" aria-labelledby={`${tabsId}-summary`} hidden={tab !== "summary"} tabIndex={0} className={styles.tabPanel}>
          <h3>Informasi scan</h3>
          <dl className={styles.metadataGrid}>
            <Metadata icon={<Tag size={22} />} label="Kategori">{recognized(scan) ? categoryName(scan.categoryId, categories) : "Belum ditentukan"}</Metadata>
            <Metadata icon={<CheckCircle2 size={22} />} label="Status">{statusLabel(scan)}</Metadata>
            <Metadata icon={<CalendarDays size={22} />} label="Tanggal"><time dateTime={scan.createdAt}>{dateFormat.format(new Date(scan.createdAt))}</time></Metadata>
            <Metadata icon={<Clock3 size={22} />} label="Waktu"><time dateTime={scan.createdAt}>{displayTime(scan.createdAt)}</time></Metadata>
          </dl>
          <p className={styles.infoStrip}><Info size={19} /><span>Hasil scan mengenali kategori material. Laporan lokasi tetap perlu ditinjau.</span></p>
          {scan.status === "failed" && <p className={styles.failureNote} role="status">{scan.errorCode ? errorMessages[scan.errorCode] : "Foto belum berhasil diproses. Anda dapat mencoba scan lagi."}</p>}
          {pending(scan) && <p className={styles.processNote} role="status"><LoaderCircle size={17} className={styles.spin} />Hasil diperbarui otomatis selama pemindaian diproses.</p>}
          <section className={styles.guideCard}><Image src="/images/history/guide.webp" alt="" width={100} height={90} /><div><h3>Panduan hasil scan</h3><p>Pahami hasil dan langkah berikutnya.</p></div><button className={styles.outlineButton} type="button" onClick={() => chooseTab("guide")}>Buka panduan<ChevronRight size={17} /></button></section>
        </section>
        <section id={`${tabsId}-guide-panel`} role="tabpanel" aria-labelledby={`${tabsId}-guide`} hidden={tab !== "guide"} tabIndex={0} className={styles.tabPanel}>
          <div className={styles.guideIntro}><Image src="/images/history/guide.webp" alt="" width={130} height={110} /><div><h3>Pahami hasil scan Anda</h3><p>{recognized(scan) ? `Material dikelompokkan ke kategori ${categoryName(scan.categoryId, categories)}.` : pending(scan) ? "Foto masih diproses. Tunggu hingga hasil tersedia." : scan.outcome === "no_waste" ? "Tidak ada sampah yang terdeteksi pada foto ini." : "Material pada foto belum berhasil dikenali."}</p></div></div>
          <ol className={styles.guideSteps}><li><span>1</span><div><h4>Periksa hasil pengenalan</h4><p>Hasil AI adalah bantuan pengenalan kategori, bukan kepastian tentang kondisi atau kandungan objek.</p></div></li><li><span>2</span><div><h4>Gunakan foto yang jelas</h4><p>Jika hasil belum sesuai, scan lagi dengan cahaya cukup dan satu objek utama yang terlihat jelas.</p></div></li><li><span>3</span><div><h4>Laporkan lokasi temuan</h4><p>Buat laporan penumpukan dengan bukti foto, lokasi, dan waktu. Laporan diperiksa admin sebelum masuk ringkasan peta publik.</p></div></li></ol>
          <p className={styles.infoStrip}><Info size={19} /><span>Foto pemindaian hanya ditampilkan melalui akses privat akun Anda.</span></p>
        </section>
      </div>
      <footer className={styles.drawerFooter}><h3>Langkah berikutnya</h3><p>Laporkan temuan atau mulai pemindaian baru.</p><button className={styles.primaryButton} type="button" onClick={onOpenReport}><MapPin size={20} />Buat laporan lokasi</button><button className={styles.outlineButton} type="button" onClick={onScanAgain}><Camera size={21} strokeWidth={2.2} />Scan lagi</button></footer>
    </div>
  </dialog>;
}

export default function ScanHistoryView({ scans, categories, onNavigate, onOpenReport }: Props) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [period, setPeriod] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SapScan | null>(null);
  const [updates, setUpdates] = useState<Record<string, SapScan>>({});
  const [shown, setShown] = useState(20);
  const [periodStart, setPeriodStart] = useState(0);
  const updateScan = useCallback((scan: SapScan) => setUpdates(previous => ({ ...previous, [scan.id]: scan })), []);
  const items = useMemo(() => scans.map(scan => updates[scan.id] || scan).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [scans, updates]);
  const totals = { all: items.length, recognized: items.filter(recognized).length, unrecognized: items.filter(unrecognized).length };
  const filtered = items.filter(scan => {
    const matchStatus = filter === "all" || (filter === "recognized" ? recognized(scan) : unrecognized(scan));
    const matchPeriod = period === "all" || Date.parse(scan.createdAt) >= periodStart;
    const text = `${scanTitle(scan, categories)} ${scan.id} ${statusLabel(scan)} ${recognized(scan) ? "Dikenali" : unrecognized(scan) ? "Belum dikenali" : ""}`.toLocaleLowerCase("id-ID");
    return matchStatus && matchPeriod && text.includes(query.trim().toLocaleLowerCase("id-ID"));
  });
  const groups = new Map<string, SapScan[]>();
  for (const scan of filtered.slice(0, shown)) { const day = dayFormat.format(new Date(scan.createdAt)); const group = groups.get(day) || []; group.push(scan); groups.set(day, group); }
  const activeFilters = filter !== "all" || period !== "all" || !!query.trim();
  function resetFilters() { setFilter("all"); setPeriod("all"); setQuery(""); setShown(20); }
  function navigate(action: () => void) { setSelected(null); action(); }
  return <div className={styles.screen}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>AKTIVITAS ANDA</span><h1>Riwayat scan</h1><p>Lihat kembali hasil pemindaian Anda.</p></div><button type="button" className={styles.primaryButton} onClick={() => onNavigate("scan")}><Camera size={21} strokeWidth={2.2} />Scan baru</button></header>
    <div className={styles.stats} aria-label="Ringkasan seluruh riwayat scan">
      <div className={styles.stat}><span className={styles.iconTile}><FileText size={26} /></span><div><span>Total scan</span><strong>{totals.all}</strong></div></div>
      <div className={styles.stat}><span className={styles.iconTile}><CheckCircle2 size={28} /></span><div><span>Dikenali</span><strong>{totals.recognized}</strong></div></div>
      <div className={`${styles.stat} ${styles.neutralStat}`}><span className={styles.iconTile}><CircleHelp size={28} /></span><div><span>Belum dikenali</span><strong>{totals.unrecognized}</strong></div></div>
    </div>
    <div className={styles.mainGrid}>
      <section className={styles.listCard} aria-label="Daftar riwayat scan">
        <div className={styles.toolbar}><div className={styles.filterPills} role="group" aria-label="Filter hasil scan">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setShown(20); }}>{item.label}</button>)}</div><label className={styles.period}><CalendarDays size={19} /><select aria-label="Pilih periode riwayat scan" value={period} onChange={event => { const value = event.target.value; setPeriod(value); setPeriodStart(Date.now() - Number(value) * 86_400_000); setShown(20); }}><option value="all">Pilih periode</option><option value="7">7 hari terakhir</option><option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option></select><ChevronDown size={16} /></label><div className={styles.search}><Search size={19} /><input type="search" placeholder="Cari hasil scan…" aria-label="Cari hasil scan berdasarkan kategori atau ID" value={query} onChange={event => { setQuery(event.target.value); setShown(20); }} />{query && <button type="button" onClick={() => { setQuery(""); setShown(20); }} aria-label="Hapus pencarian"><X size={16} /></button>}</div></div>
        {filtered.length > 0 ? <div className={styles.groups}>{Array.from(groups).map(([day, entries]) => <section key={day} className={styles.dayGroup}><h2>{day}</h2><div className={styles.rows}>{entries.map(scan => <button className={styles.row} type="button" key={scan.id} aria-haspopup="dialog" onClick={() => setSelected(scan)} aria-label={`Lihat detail ${scanTitle(scan, categories)}, ${dateFormat.format(new Date(scan.createdAt))}, ${displayTime(scan.createdAt)}`}><CategoryArt scan={scan} /><span className={styles.rowCopy}><strong>{scanTitle(scan, categories)}</strong><span>Scan #{scan.id.slice(0, 8)}</span><small><Clock3 size={15} /><time dateTime={scan.createdAt}>{dateFormat.format(new Date(scan.createdAt))} · {displayTime(scan.createdAt)}</time></small></span><ResultBadge scan={scan} /><ChevronRight className={styles.rowArrow} size={21} /></button>)}</div></section>)}</div> : <div className={styles.empty}><Image src="/images/history/camera-botanical.webp" alt="" width={270} height={150} /><h2>{activeFilters ? "Tidak ada hasil yang cocok" : "Belum ada riwayat scan"}</h2><p>{activeFilters ? "Coba kategori, ID, atau periode lain untuk menemukan hasil." : "Ambil atau unggah foto pertama Anda. Hasil akan tersimpan di sini."}</p><button className={activeFilters ? styles.outlineButton : styles.primaryButton} type="button" onClick={activeFilters ? resetFilters : () => onNavigate("scan")}>{activeFilters ? <Filter size={18} /> : <Camera size={20} />}{activeFilters ? "Reset filter" : "Mulai scan"}</button></div>}
        <footer className={styles.listFooter}><span role="status">{filtered.length > shown ? `Menampilkan ${shown} dari ${filtered.length} hasil scan` : `Menampilkan ${filtered.length} hasil scan`}</span>{filtered.length > shown ? <button type="button" onClick={() => setShown(value => value + 20)}>Tampilkan lebih banyak<ChevronDown size={17} /></button> : filtered.length > 0 ? <span className={styles.listHint}>Klik hasil untuk melihat detail<ArrowRight size={17} /></span> : null}</footer>
      </section>
      <aside className={styles.aboutCard} aria-labelledby="history-about"><h2 id="history-about"><span><Info size={22} /></span>Tentang riwayat</h2><Image className={styles.cameraArt} src="/images/history/camera-botanical.webp" alt="" width={420} height={220} sizes="(max-width: 1100px) 300px, 25vw" /><ul><li><span className={styles.iconTile}><FileText size={20} /></span>Hasil scan tersimpan pada akun Anda.</li><li><span className={styles.iconTile}><Filter size={20} /></span>Gunakan filter untuk menemukan hasil.</li><li><span className={styles.iconTile}><ChevronRight size={22} /></span>Buka detail untuk melihat kategori.</li></ul></aside>
    </div>
    <section className={styles.scanCallout}><span className={styles.iconTile}><Leaf size={27} /></span><div><h2>Siap mengenali sampah berikutnya?</h2><p>Ambil foto yang jelas untuk membantu pengenalan material.</p></div><button className={styles.outlineButton} type="button" onClick={() => onNavigate("scan")}><Camera size={21} strokeWidth={2.2} />Mulai scan</button><Image className={styles.calloutFoliage} src="/images/settings/profile-botanical.webp" alt="" width={180} height={180} /></section>
    <p className={styles.pageNote}><Info size={19} /><span>Hasil scan membantu mengenali material. Laporan lokasi tetap perlu ditinjau.</span></p>
    {selected && <ScanDetail key={selected.id} initial={selected} categories={categories} onClose={() => setSelected(null)} onUpdate={updateScan} onOpenReport={() => navigate(onOpenReport)} onScanAgain={() => navigate(() => onNavigate("scan"))} />}
  </div>;
}
