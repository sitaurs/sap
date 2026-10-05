"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDot, Instagram, LoaderCircle, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import type { SapCategory } from "../../lib/api/client";
import { ApiError } from "../../lib/api/client";
import { getInstagramAuthorization, getInstagramOverview } from "../../lib/api/instagram";
import DialogShell from "./dialog-shell";
import PublicationDetail from "./publication-detail";
import PublicationList from "./publication-list";
import PublicationSettingsPanel from "./publication-settings";
import ReportPicker from "./report-picker";
import { Notice } from "./publication-ui";
import { buildCaption } from "./publication-utils";
import { PREVIEW_SETTINGS, type InstagramOverview, type InstagramPost, type PostPreview, type PublicationSource } from "./types";
import styles from "./instagram.module.css";

export default function InstagramPublication({ categories, onModeration }: { categories: SapCategory[]; onModeration: () => void }) {
  const [section, setSection] = useState<"posts" | "settings">("posts");
  const [overview, setOverview] = useState<InstagramOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState<{ post: InstagramPost | null; preview: PostPreview | null } | null>(null);
  const [account, setAccount] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connectionResult, setConnectionResult] = useState<"connected" | "failed" | "state-invalid" | null>(null);
  const [connectionReason, setConnectionReason] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const id = useId();
  const available = !!overview && !unavailable;
  const refresh = useCallback(() => setReloadKey(value => value + 1), []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("publication") === "settings") setSection("settings");
    const url = new URL(window.location.href);
    const result = url.searchParams.get("connection");
    if (result === "connected" || result === "failed" || result === "state-invalid") setConnectionResult(result);
    const reason = url.searchParams.get("connectionReason");
    if (reason) setConnectionReason(reason);
    if (result) {
      url.searchParams.delete("connection");
      url.searchParams.delete("connectionReason");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    getInstagramOverview(controller.signal).then(value => {
      if (!controller.signal.aborted) { setOverview(value); setUnavailable(false); }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setOverview(null);
      const missing = cause instanceof ApiError && cause.status === 404;
      setUnavailable(missing);
      if (!missing) setError(cause instanceof Error ? cause.message : "Layanan publikasi belum dapat dimuat.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey]);
  function selectSection(next: "posts" | "settings") {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "settings") url.searchParams.set("publication", "settings");
    else url.searchParams.delete("publication");
    window.history.replaceState(null, "", url);
  }
  function choose(source: PublicationSource) {
    setPicker(false);
    setDetail({ post: null, preview: { source, caption: buildCaption(source, overview?.settings ?? PREVIEW_SETTINGS), altText: `${source.categoryName}. ${source.publicSummary}`.slice(0, 1000) } });
  }
  async function connect() {
    if (!overview?.capabilities.canConnect || connecting) return;
    setConnecting(true); setConnectionError("");
    try {
      const data = await getInstagramAuthorization();
      const url = new URL(data.authorizationUrl);
      if (url.protocol !== "https:" || !["www.facebook.com", "facebook.com", "www.instagram.com", "api.instagram.com"].includes(url.hostname)) throw new Error("Tautan otorisasi Instagram belum valid. Hubungi pengelola SAP.");
      window.location.assign(url.href);
    } catch (cause) { setConnectionError(cause instanceof Error ? cause.message : "Akun belum dapat dihubungkan."); setConnecting(false); }
  }
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}><CircleDot size={13} />ADMIN · PUBLIKASI</span><h1>Publikasi Instagram</h1><p>Kelola draf poster, persetujuan admin, dan operasi publikasi.</p><button className={styles.connectionPill} type="button" onClick={() => { setAccount(true); setConnectionError(""); }}><Instagram size={19} /><strong>{overview?.account.username ? `@${overview.account.username}` : "Akun Instagram"}</strong><span className={styles.connectionSeparator} /><span><i data-connected={overview?.account.status === "connected"} />{loading ? "Memuat…" : overview?.account.status === "connected" ? "Terhubung" : overview?.account.status === "expired" ? "Perlu dihubungkan ulang" : overview?.account.status === "needs_action" ? "Perlu tindakan admin" : "Belum terhubung"}</span></button></div><button className={styles.primary} type="button" onClick={() => setPicker(true)} disabled={!overview?.capabilities.canCreateDraft}><Plus size={20} />Pilih laporan</button></header>
    {connectionResult && <Notice warning={connectionResult !== "connected"}><strong>{connectionResult === "connected" ? "Akun Instagram berhasil dihubungkan." : connectionResult === "state-invalid" ? "Permintaan login kedaluwarsa atau sudah pernah digunakan." : connectionFailure(connectionReason).title}</strong><p>{connectionResult === "connected" ? "SAP sudah menerima akun publikasi. Muat ulang informasi akun bila status belum berubah." : connectionResult === "state-invalid" ? "Mulai lagi dari tombol Hubungkan akun. Jangan membuka ulang URL callback dari percobaan sebelumnya." : connectionFailure(connectionReason).message}</p>{connectionResult === "failed" && connectionReason && <small>Kode untuk admin: {connectionReason}</small>}{connectionResult !== "connected" && <button className={styles.textButton} type="button" onClick={() => setAccount(true)}>Coba hubungkan lagi<ArrowRight size={15} /></button>}</Notice>}
    <div className={styles.tabs} role="tablist" aria-label="Publikasi Instagram" onKeyDown={event => {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const next = event.key === "Home" ? "posts" : event.key === "End" ? "settings" : section === "posts" ? "settings" : "posts";
        selectSection(next); document.getElementById(`${id}-tab-${next}`)?.focus();
      }
    }}><button id={`${id}-tab-posts`} role="tab" type="button" aria-selected={section === "posts"} aria-controls={`${id}-posts`} tabIndex={section === "posts" ? 0 : -1} onClick={() => selectSection("posts")}><FileTextIcon />Postingan</button><button id={`${id}-tab-settings`} role="tab" type="button" aria-selected={section === "settings"} aria-controls={`${id}-settings`} tabIndex={section === "settings" ? 0 : -1} onClick={() => selectSection("settings")}>Pengaturan postingan</button></div>
    {unavailable && !loading && <Notice warning><strong>Publikasi Instagram belum diaktifkan</strong><p>Anda bisa meninjau laporan dan menyiapkan caption. Penyimpanan draf, pengaturan, dan posting menunggu integrasi layanan publikasi.</p></Notice>}
    {error && <div className={styles.error} role="alert"><strong>Informasi publikasi belum tersedia</strong><p>{error}</p><button type="button" onClick={refresh}><RefreshCw size={16} />Coba lagi</button></div>}
    {savedMessage && <p className={styles.success} role="status"><CheckCircle2 size={18} />{savedMessage}</p>}
    <div id={`${id}-posts`} role="tabpanel" aria-labelledby={`${id}-tab-posts`} hidden={section !== "posts"} className={styles.tabPanel}><PublicationList overview={overview} available={available} loadingOverview={loading} reloadKey={reloadKey} onChoose={() => setPicker(true)} onOpen={post => setDetail({ post, preview: null })} onRefresh={refresh} /></div>
    <div id={`${id}-settings`} role="tabpanel" aria-labelledby={`${id}-tab-settings`} hidden={section !== "settings"} className={styles.tabPanel}>{loading && !overview ? <div className={styles.busy} role="status"><LoaderCircle size={22} className={styles.spin} />Memuat pengaturan…</div> : <PublicationSettingsPanel key={overview?.settings.revision ?? "preview"} overview={overview} available={available} onSaved={() => { setSavedMessage("Pengaturan publikasi tersimpan."); refresh(); }} onAccount={() => setAccount(true)} onBack={() => selectSection("posts")} />}</div>
    {picker && <ReportPicker categories={categories} onClose={() => setPicker(false)} onChoose={choose} onModeration={onModeration} />}
    {detail && <PublicationDetail key={detail.post?.id ?? detail.preview?.source.mediaId} post={detail.post} preview={detail.preview} overview={overview} available={available} onClose={() => setDetail(null)} onChanged={refresh} onSettings={() => { setDetail(null); selectSection("settings"); }} onReport={onModeration} />}
    {account && <DialogShell title="Akun Instagram" subtitle="Tujuan publikasi SAP." onClose={() => setAccount(false)} busy={connecting} footer={<button className={styles.primary} type="button" onClick={() => void connect()} disabled={!available || !overview?.capabilities.canConnect || connecting}>{connecting ? <LoaderCircle className={styles.spin} size={18} /> : <Instagram size={18} />}{overview?.account.status === "connected" ? "Hubungkan ulang akun" : "Hubungkan akun"}<ArrowRight size={17} /></button>}>
      <div className={styles.connectionArt}><Instagram size={46} /><h3>{overview?.account.username ? `@${overview.account.username}` : "Hubungkan akun publikasi SAP"}</h3><p>{overview?.account.status === "connected" ? "Akun terhubung ke layanan publikasi." : "Akun diperlukan untuk menerbitkan foto dan caption ke Instagram."}</p></div>
      <Notice><ShieldCheck size={19} className={styles.inlineIcon} />{available && overview?.capabilities.canConnect ? "Lanjutkan melalui halaman otorisasi resmi Meta. Kata sandi dan token tidak dimasukkan di SAP." : "Koneksi akun belum diaktifkan oleh pengelola. Foto laporan tetap tersedia untuk ditinjau."}</Notice>
      {overview?.account.status === "connected" && <p className={styles.success}><CheckCircle2 size={18} />Terhubung</p>}
      {connectionError && <div className={styles.error} role="alert">{connectionError}</div>}
    </DialogShell>}
  </div>;
}

function FileTextIcon() { return <span className={styles.tabDot} aria-hidden="true" />; }

function connectionFailure(reason: string | null): { title: string; message: string } {
  const failures: Record<string, { title: string; message: string }> = {
    USER_DENIED: { title: "Izin Meta belum disetujui.", message: "Mulai hubungkan lagi dan setujui permintaan akses akun SAP." },
    META_PERMISSION_REQUIRED: { title: "Izin Instagram belum lengkap.", message: "Pastikan izin instagram_basic, instagram_content_publish, pages_show_list, dan pages_read_engagement diminta dan disetujui." },
    META_PROFESSIONAL_ACCOUNT_REQUIRED: { title: "Instagram belum ditemukan pada Facebook Page.", message: "Pastikan akun Instagram bertipe Professional (Business atau Creator), sudah ditautkan ke Facebook Page, dan akun Facebook yang dipakai memiliki akses ke Page tersebut." },
    META_ACCOUNT_AMBIGUOUS: { title: "Ada lebih dari satu akun Instagram yang tertaut.", message: "Hubungi admin SAP untuk memilih Facebook Page tujuan publikasi." },
    META_RATE_LIMITED: { title: "Meta membatasi sementara permintaan ini.", message: "Tunggu sebentar, lalu coba hubungkan lagi." },
    META_RESPONSE_UNCERTAIN: { title: "SAP belum menerima jawaban dari Meta.", message: "Periksa koneksi internet lalu coba lagi. Jika berulang, kirim kode admin di bawah ke pengelola SAP." },
    META_TOKEN_EXPIRED: { title: "Token dari Meta sudah kedaluwarsa.", message: "Mulai ulang proses Hubungkan akun agar Meta memberikan token baru." },
    META_TOKEN_INVALID: { title: "Meta tidak memberikan token yang dapat digunakan.", message: "Coba hubungkan ulang. Jika gagal lagi, kirim kode admin di bawah ke pengelola SAP." },
    META_CODE_MISSING: { title: "Meta tidak mengirim kode izin.", message: "Mulai ulang proses Hubungkan akun." },
    META_CONFIGURATION_REQUIRED: { title: "Konfigurasi Meta di SAP belum lengkap.", message: "Hubungi pengelola SAP dan kirim kode admin di bawah." },
    META_VERSION_INVALID: { title: "Versi Graph API SAP tidak valid.", message: "Hubungi pengelola SAP dan kirim kode admin di bawah." },
    META_REQUEST_FAILED: { title: "Meta menolak permintaan koneksi.", message: "Coba lagi. Jika gagal lagi, kirim kode admin di bawah agar pengelola bisa memeriksa izin dan konfigurasi Meta." },
  };
  return failures[reason ?? ""] ?? {
    title: "Meta belum berhasil menghubungkan akun.",
    message: reason ? "Kirim kode admin di bawah ke pengelola SAP agar penyebabnya bisa diperiksa." : "Coba hubungkan lagi. Jika gagal, pengelola SAP perlu memeriksa log koneksi Meta.",
  };
}
