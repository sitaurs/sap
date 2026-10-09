"use client";

import { useRef, useState } from "react";
import { Check, Eye, ImageOff, Info, Loader2, LockKeyhole, Maximize2, RefreshCw, X } from "lucide-react";
import type { EvidenceRendition } from "../../lib/api/community";
import { useI18n } from "../../lib/i18n/provider";
import ui from "./decision-dialog.module.css";

export type ReviewPhoto = { mediaId: string; url: string; renditions: EvidenceRendition[] };

export function ReportEvidenceCard({ item, index, canPublish, selected, webApproved, instagramApproved, pending, onSelect, onPrepare, onApprove, onRefresh }: {
  item: ReviewPhoto; index: number; canPublish: boolean; selected: string;
  webApproved: boolean; instagramApproved: boolean; pending: boolean;
  onSelect: (id: string) => void; onPrepare: () => void;
  onApprove: (channel: "web" | "instagram") => void; onRefresh: () => void;
}) {
  const { t } = useI18n();
  const viewer = useRef<HTMLDialogElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ready = item.renditions.some(rendition => rendition.status === "ready");
  const photoName = t("Bukti laporan {0}", { "0": index + 1 });
  return <article className={ui.evidenceCard}>
    <figure className={ui.figure}>
      <div className={ui.photo}>
        {failedUrl === item.url ? <div className={ui.photoFallback} role="status"><ImageOff size={30} /><span>{t("Foto bukti belum dapat ditampilkan.")}</span><button type="button" className={ui.outline} onClick={() => { setFailedUrl(null); onRefresh(); }} disabled={pending}><RefreshCw size={16} />{t("Muat ulang bukti")}</button></div>
          : <img src={item.url} alt={photoName} onError={() => setFailedUrl(item.url)} />}
        <span className={ui.privateLabel}><LockKeyhole size={15} />{t("Privat · hanya moderator")}</span>
        {failedUrl !== item.url && <button type="button" className={ui.expand} aria-label={t("Perbesar foto {0}", { "0": index + 1 })} onClick={() => viewer.current?.showModal()}><Maximize2 size={18} /></button>}
      </div>
      <figcaption>{t("Foto")}{" "}{index + 1}</figcaption>
    </figure>
    {canPublish && <>
      <label className={ui.field}><span>{t("Versi bukti")}</span>
        <select aria-label={t("Versi bukti foto {0}", { "0": index + 1 })} value={selected} disabled={pending} onChange={event => onSelect(event.target.value)}>
          <option value="">{t("Pilih versi siap")}</option>
          {item.renditions.map(rendition => <option key={rendition.id} value={rendition.id} disabled={rendition.status !== "ready"}>{rendition.status} · r{rendition.revision}</option>)}
        </select>
      </label>
      {!ready && <button type="button" className={ui.outline} onClick={onPrepare} disabled={pending}><Eye size={18} />{t("Siapkan pratinjau bukti")}</button>}
      {item.renditions.some(rendition => rendition.status === "queued") && <button type="button" className={ui.textButton} onClick={onRefresh} disabled={pending}><RefreshCw size={15} />{t("Muat ulang bukti")}</button>}
      <section className={ui.permissions} aria-label={t("Izin publikasi foto {0}", { "0": index + 1 })}>
        <h4><LockKeyhole size={19} />{t("Izin publikasi foto")}</h4>
        {(["web", "instagram"] as const).map(channel => {
          const approved = channel === "web" ? webApproved : instagramApproved;
          return <div key={channel} className={ui.permissionRow}>
            <span className={ui.permissionCheck} data-approved={approved} aria-hidden="true">{approved && <Check size={15} />}</span>
            <div className={ui.permissionText}><strong>{channel === "web" ? "Web SAP" : "Instagram"}</strong><small>{t(!ready ? "Publikasi foto memerlukan versi siap." : channel === "web" ? "Setujui web mengizinkan foto tampil di halaman publik SAP." : "Persetujuan Instagram terpisah dari penerbitan postingan.")}</small></div>
            <div className={ui.permissionAction}>
              <span className={ui.permissionStatus} data-approved={approved}>{t(approved ? "Disetujui" : "Belum disetujui")}</span>
              <span className={ui.srOnly}>{t(channel === "web" ? approved ? "Web: foto publik disetujui" : "Web: foto belum disetujui" : approved ? "Instagram: foto disetujui" : "Instagram: foto belum disetujui")}</span>
              {ready && !approved && <button type="button" className={ui.channelButton} disabled={!selected || pending} onClick={() => onApprove(channel)}>{t(channel === "web" ? "Setujui web" : "Setujui Instagram")}</button>}
            </div>
          </div>;
        })}
        <p className={ui.permissionHint}><Info size={16} />{t(selected ? "Persetujuan memerlukan izin pemilik untuk kanal yang dipilih." : "Pilih versi siap untuk mengaktifkan persetujuan.")}</p>
      </section>
    </>}
    {pending && <span className={ui.loading} role="status"><Loader2 size={15} className={ui.spin} />{t("Memproses bukti…")}</span>}
    <dialog ref={viewer} className={ui.photoViewer} aria-label={photoName}>
      <button type="button" className={ui.viewerClose} onClick={() => viewer.current?.close()} aria-label={t("Tutup foto")}><X size={23} /></button>
      <img src={item.url} alt={photoName} />
      <p><LockKeyhole size={15} />{t("Privat · hanya moderator")}</p>
    </dialog>
  </article>;
}
