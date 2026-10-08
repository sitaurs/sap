"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, Maximize2, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import type { EvidenceRendition } from "../../lib/api/community";
import styles from "./community-admin.module.css";

export type MediaReview = { mediaId: string; url: string; renditions: EvidenceRendition[] };
type EvidenceProps = {
  media: MediaReview[];
  choices: Record<string, string>;
  channels: Record<string, { web: boolean; instagram: boolean }>;
  renderBusy: string;
  disabled: boolean;
  onChoice: (mediaId: string, value: string) => void;
  onChannel: (mediaId: string, channel: "web" | "instagram", checked: boolean) => void;
  onRender: (mediaId: string) => void;
};

export default function CommunityReviewEvidence({ media, choices, channels, renderBusy, disabled, onChoice, onChannel, onRender }: EvidenceProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [previewId, setPreviewId] = useState("");
  const preview = media.find(item => item.mediaId === previewId);
  const previewRendition = preview?.renditions.find(item => item.id === choices[preview.mediaId]);

  useEffect(() => {
    if (previewId && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [previewId]);

  return <div className={styles.evidenceGallery}>
    {media.length ? <div className={styles.evidenceGrid}>{media.map((item, index) => {
      const chosen = item.renditions.find(rendition => rendition.id === choices[item.mediaId]);
      return <figure key={item.mediaId} className={styles.photoFrame}>
        <img src={chosen?.url ?? item.url} alt={`Bukti pembaruan komunitas ${index + 1}`} />
        <figcaption className={styles.privateBadge}><ShieldCheck size={12} aria-hidden="true" />Bukti privat untuk moderator</figcaption>
        <button type="button" className={styles.expandPhoto} aria-label={`Perbesar bukti ${index + 1}`} onClick={() => setPreviewId(item.mediaId)}><Maximize2 size={17} aria-hidden="true" /></button>
      </figure>;
    })}</div> : <div className={styles.noEvidence}><ImageOff size={25} aria-hidden="true" /><span>Belum ada foto bukti.</span></div>}
    {media.length > 0 && <details className={styles.evidenceControls}>
      <summary><SlidersHorizontal size={13} aria-hidden="true" />Versi bukti dan izin publikasi<span>{media.length} foto</span></summary>
      <div className={styles.evidenceOptions}>{media.map((item, index) => {
        const chosen = item.renditions.find(rendition => rendition.id === choices[item.mediaId]);
        return <article key={item.mediaId} className={styles.evidenceCard}>
          <label className={styles.renditionLabel}><span>Versi bukti{media.length > 1 ? ` ${index + 1}` : ""}</span><select value={choices[item.mediaId] ?? ""} onChange={event => onChoice(item.mediaId, event.target.value)} disabled={disabled}><option value="">Pilih versi siap</option>{item.renditions.map(rendition => <option key={rendition.id} value={rendition.id} disabled={rendition.status !== "ready"}>{rendition.status} · r{rendition.revision}</option>)}</select></label>
          {!item.renditions.some(rendition => rendition.status === "ready") && <button type="button" className={styles.smallButton} onClick={() => onRender(item.mediaId)} disabled={disabled || !!renderBusy}>{renderBusy === item.mediaId ? "Menyiapkan…" : "Siapkan pratinjau bukti"}</button>}
          <div className={styles.channelChecks}><label><input type="checkbox" checked={channels[item.mediaId]?.web ?? false} onChange={event => onChannel(item.mediaId, "web", event.target.checked)} disabled={disabled || chosen?.status !== "ready"} /> Izin web</label><label><input type="checkbox" checked={channels[item.mediaId]?.instagram ?? false} onChange={event => onChannel(item.mediaId, "instagram", event.target.checked)} disabled={disabled || chosen?.status !== "ready"} /> Izin Instagram</label></div>
          <p className={styles.helper}>Bukti tetap privat sampai versi siap dan kanalnya disetujui moderator.</p>
        </article>;
      })}</div>
    </details>}
    <dialog ref={dialog} className={styles.photoDialog} onClose={() => setPreviewId("")} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="private-evidence-title">
      <header><div><h3 id="private-evidence-title">Pratinjau bukti privat</h3><p>Untuk pemeriksaan moderator. Membuka foto tidak memberikan izin publikasi.</p></div><button type="button" className={styles.closePhoto} aria-label="Tutup pratinjau bukti" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header>
      {preview && <img src={previewRendition?.url ?? preview.url} alt="Bukti privat dalam ukuran penuh" />}
    </dialog>
  </div>;
}
