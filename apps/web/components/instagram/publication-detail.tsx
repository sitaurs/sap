"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Instagram, LoaderCircle, RefreshCw, Save, Send, Settings2, ShieldCheck } from "lucide-react";
import PublicationPhoto from "./publication-photo";
import { createInstagramDraft, getInstagramPost, publishInstagramPost, updateInstagramDraft } from "../../lib/api/instagram";
import DialogShell from "./dialog-shell";
import { DateStamp, Notice, PostStatus } from "./publication-ui";
import { instagramPermalink, shortId } from "./publication-utils";
import type { InstagramOverview, InstagramPost, PostPreview } from "./types";
import styles from "./instagram.module.css";

export default function PublicationDetail({ post, preview, overview, available, onClose, onChanged, onSettings, onReport }: {
  post: InstagramPost | null; preview: PostPreview | null; overview: InstagramOverview | null;
  available: boolean; onClose: () => void; onChanged: () => void; onSettings: () => void; onReport: () => void;
}) {
  const [record, setRecord] = useState<InstagramPost | null>(post);
  const [caption, setCaption] = useState(post?.caption ?? preview?.caption ?? "");
  const [loading, setLoading] = useState(!!post);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const createIntent = useRef<{ body: string; key: string } | null>(null);
  const publishIntent = useRef<{ revision: number; key: string } | null>(null);
  const recordId = post?.id ?? record?.id;
  useEffect(() => {
    if (!recordId) return;
    const controller = new AbortController(); setLoading(true); setError("");
    getInstagramPost(recordId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setRecord(value); setCaption(value.caption); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail belum dapat dimuat."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [recordId, refresh]);
  useEffect(() => {
    if (record?.status !== "publishing") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120_000;
    async function poll() {
      if (Date.now() > deadline || controller.signal.aborted) return;
      try {
        const updated = await getInstagramPost(record!.id, controller.signal);
        if (controller.signal.aborted) return;
        setRecord(updated);
        if (updated.status !== "publishing") { onChanged(); return; }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Status publikasi belum dapat diperbarui.");
        return;
      }
      timer = setTimeout(() => void poll(), 5000);
    }
    timer = setTimeout(() => void poll(), 5000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [record?.id, record?.status, onChanged]);
  const source = record?.source ?? preview!.source;
  const baseline = record?.caption ?? preview?.caption ?? "";
  const dirty = caption !== baseline;
  const editable = !record || record.status === "draft" || record.status === "failed";
  const valid = !!caption.trim() && caption.length <= 2200;
  const permalink = instagramPermalink(record?.permalink ?? null);
  const canPublish = !!record && editable && !dirty && !error && valid && !!overview?.capabilities.canPublish && overview.account.status === "connected";
  function close() { if (dirty) setConfirmDiscard(true); else onClose(); }
  async function save() {
    if (busy || loading || !available || !valid || !editable) return;
    setBusy(true); setError(""); setMessage(""); setConfirmPublish(false);
    try {
      let updated: InstagramPost;
      if (record) updated = await updateInstagramDraft(record, caption);
      else {
        const body = { reportId: source.reportId, mediaId: source.mediaId, caption };
        const encoded = JSON.stringify(body);
        if (createIntent.current?.body !== encoded) createIntent.current = { body: encoded, key: crypto.randomUUID() };
        updated = await createInstagramDraft(body, createIntent.current!.key);
      }
      setRecord(updated); setCaption(updated.caption); setMessage("Draf tersimpan."); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Draf belum tersimpan. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!record || busy || loading || !canPublish) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (publishIntent.current?.revision !== record.revision) publishIntent.current = { revision: record.revision, key: crypto.randomUUID() };
      const updated = await publishInstagramPost(record, publishIntent.current!.key);
      setRecord(updated); setCaption(updated.caption); setConfirmPublish(false);
      setMessage(updated.status === "published" ? "Postingan berhasil diterbitkan." : updated.status === "publishing" ? "Publikasi sedang diproses. Status akan diperbarui." : "Permintaan publikasi diterima; periksa statusnya.");
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Postingan belum berhasil diterbitkan."); }
    finally { setBusy(false); }
  }
  const footer = <>
    {confirmPublish ? <div className={styles.confirmation}><strong>Posting ke {overview?.account.username ? `@${overview.account.username}` : "Instagram"} sekarang?</strong><p>Foto dan caption ini akan terlihat oleh publik.</p><div><button className={styles.secondary} type="button" onClick={() => setConfirmPublish(false)} disabled={busy}>Kembali meninjau</button><button className={styles.primary} type="button" onClick={() => void publish()} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} size={18} /> : <Send size={18} />}Ya, posting sekarang</button></div></div> : <div className={styles.footerActions}>
      {editable ? <><button className={styles.secondary} type="button" onClick={() => void save()} disabled={busy || loading || !available || !valid || (!!record && !dirty)}>{busy ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}Simpan draf</button><button className={styles.primary} type="button" onClick={() => setConfirmPublish(true)} disabled={busy || loading || !canPublish}><Send size={18} />Posting sekarang</button></> : permalink ? <a href={permalink} className={styles.primary} target="_blank" rel="noopener noreferrer">Lihat di Instagram<ExternalLink size={18} /></a> : <button className={styles.secondary} type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={18} />Perbarui status</button>}
    </div>}
    {!available && <small className={styles.footerHint}>Pratinjau belum tersimpan. Penyimpanan dan posting menunggu aktivasi publikasi.</small>}
    {available && editable && !canPublish && <small className={styles.footerHint}>{!record || dirty ? "Simpan draf sebelum memposting." : "Hubungkan akun dan aktifkan publikasi melalui pengaturan."}</small>}
  </>;
  return <DialogShell title="Detail postingan" subtitle="Foto laporan dan informasi publikasi." onClose={close} busy={busy} footer={footer}>
    {confirmDiscard && <div className={styles.discardPrompt} role="alert"><strong>Perubahan caption belum tersimpan.</strong><div><button className={styles.secondary} type="button" onClick={() => setConfirmDiscard(false)}>Lanjut mengedit</button><button className={styles.textButton} type="button" onClick={onClose}>Tutup tanpa menyimpan</button></div></div>}
    <div className={styles.detailTitle}><h3>{source.title}</h3><PostStatus status={record?.status ?? "preview"} /></div>
    <PublicationPhoto mediaId={source.mediaId} reportId={source.reportId} alt={source.title} className={styles.detailPhoto} />
    <div className={styles.sourceTags}><span><FileText size={14} />Laporan #{shortId(source.reportId)}</span>{source.scanId && <span>Scan #{shortId(source.scanId)}</span>}<span className={styles.categoryTag}>{source.categoryName}</span></div>
    <button className={styles.textButton} type="button" onClick={onReport} disabled={busy || dirty}>Lihat laporan di moderasi<ExternalLink size={15} /></button>
    <div className={styles.dateGrid}><div><span>Masuk draf</span><DateStamp value={record?.createdAt ?? null} empty="Belum tersimpan" /></div><div><span>Terposting</span><DateStamp value={record?.publishedAt ?? null} /></div></div>
    <label className={styles.field}><span>Caption Instagram</span><textarea rows={7} maxLength={2200} value={caption} readOnly={!editable} disabled={busy || loading} onChange={event => { setCaption(event.target.value); setConfirmPublish(false); setMessage(""); }} placeholder="Tulis caption postingan…" /><span className={styles.fieldFoot}><small>{editable ? "Tinjau ringkasan publik dan caption sebelum posting." : "Caption saat publikasi."}</small><small>{caption.length}/2.200</small></span></label>
    <div className={styles.destination}><span className={styles.smallIcon}><Instagram size={22} /></span><div><strong>{overview?.account.username ? `@${overview.account.username}` : "Akun belum terhubung"}</strong><small>Foto asli laporan · Feed</small></div><button className={styles.iconButton} type="button" aria-label="Buka pengaturan postingan" disabled={busy || dirty} onClick={onSettings}><Settings2 size={19} /></button></div>
    <Notice><ShieldCheck size={19} className={styles.inlineIcon} />{record?.status === "published" ? "Postingan sudah terbit di Instagram." : record?.status === "publishing" ? "Publikasi sedang diproses. Waktu terposting belum tersedia." : "Draf belum tampil di Instagram."}</Notice>
    {loading && <p className={styles.helper} role="status">Memuat versi terbaru postingan…</p>}
    {(error || record?.publishError) && <div className={styles.error} role="alert">{error || record?.publishError}{record && <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading || busy || dirty}>Muat versi terbaru</button>}</div>}
    {message && <div className={styles.success} role="status"><CheckCircle2 size={18} />{message}</div>}
  </DialogShell>;
}
