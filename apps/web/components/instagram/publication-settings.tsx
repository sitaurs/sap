"use client";

import { useRef, useState } from "react";
import { AlignLeft, ArrowRight, CheckCircle2, FileText, Image as ImageIcon, Instagram, LoaderCircle, Save, Settings2, ShieldCheck, Zap } from "lucide-react";
import { saveInstagramSettings } from "../../lib/api/instagram";
import { Notice } from "./publication-ui";
import { PREVIEW_SETTINGS, type InstagramOverview, type PublicationSettings } from "./types";
import styles from "./instagram.module.css";

export default function PublicationSettingsPanel({ overview, available, onSaved, onAccount, onBack }: {
  overview: InstagramOverview | null; available: boolean; onSaved: () => void; onAccount: () => void; onBack: () => void;
}) {
  const [saved, setSaved] = useState(overview?.settings ?? PREVIEW_SETTINGS);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const hashtagCount = (draft.hashtags.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  const valid = !!draft.captionTemplate.trim() && draft.captionTemplate.length <= 1800 && draft.hashtags.length <= 400 && hashtagCount <= 30;
  function patch(next: Partial<PublicationSettings>) { setDraft(current => ({ ...current, ...next })); setError(""); setMessage(""); }
  function insert(token: string) {
    const input = captionRef.current;
    const start = input?.selectionStart ?? draft.captionTemplate.length;
    const end = input?.selectionEnd ?? start;
    const value = draft.captionTemplate.slice(0, start) + token + draft.captionTemplate.slice(end);
    if (value.length > 1800) return;
    patch({ captionTemplate: value });
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
  }
  async function save() {
    if (!available || busy || !dirty || !valid) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await saveInstagramSettings(draft);
      setSaved(result); setDraft(result); setMessage("Pengaturan publikasi tersimpan."); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengaturan belum tersimpan."); }
    finally { setBusy(false); }
  }
  return <form className={styles.settingsForm} onSubmit={event => { event.preventDefault(); void save(); }}>
    <div className={styles.settingsGrid}>
      <section className={styles.settingsPanel}><header className={styles.cardHeader}><span className={styles.cardIcon}><Settings2 size={24} /></span><div><h2>Pengaturan publikasi</h2><p>Tentukan alur postingan dari laporan.</p></div></header>
        <fieldset className={styles.modeField}><legend>Alur postingan</legend><label className={`${styles.modeOption} ${draft.mode === "draft" ? styles.modeSelected : ""}`}><input type="radio" name="publication-mode" value="draft" checked={draft.mode === "draft"} onChange={() => patch({ mode: "draft" })} disabled={busy} /><FileText size={23} /><span><strong>Masuk ke draf</strong><small>Admin meninjau foto dan caption sebelum posting.</small></span></label><label className={`${styles.modeOption} ${draft.mode === "automatic" ? styles.modeSelected : ""} ${!overview?.capabilities.canAutomate ? styles.unavailableOption : ""}`}><input type="radio" name="publication-mode" value="automatic" checked={draft.mode === "automatic"} onChange={() => patch({ mode: "automatic" })} disabled={busy || !overview?.capabilities.canAutomate} /><Zap size={23} /><span><strong>Posting otomatis</strong><small>{overview?.capabilities.canAutomate ? "Publikasikan laporan yang memenuhi aturan." : "Tersedia setelah layanan automasi diaktifkan."}</small></span></label></fieldset>
        <label className={styles.field}><span>Sumber konten</span><select value={draft.source} disabled><option value="scan_reports">Laporan dari scan</option></select></label>
        <label className={styles.checkRow}><input type="checkbox" checked disabled /><span><strong>Hanya laporan terverifikasi</strong><small>Gunakan foto dan ringkasan publik yang disetujui admin.</small></span><ShieldCheck size={20} /></label>
        <Notice>{draft.mode === "draft" ? "Postingan tetap menjadi draf sampai admin memilih Posting sekarang." : "Laporan yang lolos aturan akan dipublikasikan oleh layanan automasi."}</Notice>
      </section>
      <section className={styles.settingsPanel}><header className={styles.cardHeader}><span className={styles.cardIcon}><Instagram size={25} /></span><div><h2>Tujuan publikasi</h2><p>Atur akun dan format postingan.</p></div></header>
        <div className={styles.accountCard}><div><Instagram size={25} /><span><strong>{overview?.account.username ? `@${overview.account.username}` : "Akun Instagram"}</strong><small><i data-connected={overview?.account.status === "connected"} />{overview?.account.status === "connected" ? "Terhubung" : overview?.account.status === "expired" ? "Perlu dihubungkan ulang" : "Belum terhubung"}</small></span></div><button className={styles.secondary} type="button" onClick={onAccount}>Kelola akun<ArrowRight size={16} /></button></div>
        <div className={styles.settingFields}><label className={styles.field}><span>Format postingan</span><select value="feed" disabled><option value="feed">Feed · satu foto</option></select></label><label className={styles.field}><span>Zona waktu</span><select value="Asia/Jakarta" disabled><option value="Asia/Jakarta">WIB · Asia/Jakarta</option></select></label></div>
        <div className={styles.originalPhoto}><span className={styles.cardIcon}><ImageIcon size={25} /></span><div><strong>Foto asli laporan</strong><p>Foto bersumber dari laporan dan hasil scan. Foto contoh tidak digunakan sebagai konten publikasi.</p></div><CheckCircle2 size={21} /></div>
        <p className={styles.helper}>Waktu masuk draf dan terposting dicatat oleh layanan publikasi, lalu ditampilkan dalam WIB.</p>
      </section>
    </div>
    <section className={styles.settingsPanel}><header className={styles.cardHeader}><span className={styles.cardIcon}><AlignLeft size={24} /></span><div><h2>Caption postingan</h2><p>Gunakan template yang konsisten untuk draf baru.</p></div></header>
      <div className={styles.captionGrid}><label className={styles.field}><span>Template caption</span><textarea ref={captionRef} rows={6} maxLength={1800} value={draft.captionTemplate} onChange={event => patch({ captionTemplate: event.target.value })} disabled={busy} /><small>{draft.captionTemplate.length}/1.800 karakter</small></label><div className={styles.captionTools}><label className={styles.field}><span>Hashtag</span><textarea rows={3} maxLength={400} value={draft.hashtags} onChange={event => patch({ hashtags: event.target.value })} disabled={busy} /><small>{hashtagCount}/30 hashtag</small></label><div className={styles.tokens}><span>Sisipkan data laporan</span><div><button className={styles.token} type="button" disabled={busy} onClick={() => insert("{jenis_sampah}")}>+ Jenis sampah</button><button className={styles.token} type="button" disabled={busy} onClick={() => insert("{ringkasan_laporan}")}>+ Ringkasan publik</button></div></div></div></div>
      <Notice>Caption tetap dapat diedit pada detail draf. Perubahan template tidak mengubah postingan yang sudah ada.</Notice>
    </section>
    {!available && <Notice warning>Ini pratinjau pengaturan. Preferensi belum tersimpan sampai layanan publikasi diaktifkan.</Notice>}
    {!valid && <div className={styles.error} role="alert">Isi template caption dan gunakan maksimal 30 hashtag.</div>}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.success} role="status"><CheckCircle2 size={18} />{message}</div>}
    <div className={styles.settingsActions}><span>{dirty ? "Ada perubahan yang belum tersimpan." : available ? "Pengaturan sesuai data tersimpan." : "Pratinjau · belum tersimpan"}</span><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setDraft(saved); setError(""); setMessage(""); if (!dirty) onBack(); }}>{dirty ? "Batalkan perubahan" : "Kembali"}</button><button className={styles.primary} type="submit" disabled={busy || !available || !dirty || !valid}>{busy ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}Simpan pengaturan</button></div>
  </form>;
}
