"use client";

import { useId } from "react";
import { Instagram, ShieldCheck } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import ui from "./post-detail.module.css";

export default function PostContentEditor({ caption, altText, editable, disabled, approved, approvalLabel, onCaption, onAltText }: {
  caption: string; altText: string; editable: boolean; disabled: boolean;
  approved: boolean; approvalLabel: string; onCaption: (value: string) => void; onAltText: (value: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return <>
    <div className={ui.sectionHeading}><h3>{t("Konten postingan")}</h3><span className={ui.platform}><Instagram size={16} />Instagram</span></div>
    <div className={ui.field}>
      <div className={ui.fieldHeading}><label htmlFor={`${id}-caption`}>{t("Caption Instagram")}</label><span>{caption.length}{t("/2.200 karakter")}</span></div>
      <textarea id={`${id}-caption`} aria-describedby={`${id}-caption-help`} rows={6} maxLength={2200} value={caption} readOnly={!editable} disabled={disabled} onChange={event => onCaption(event.target.value)} />
      <small id={`${id}-caption-help`}>{t("Teks ini akan tampil bersama gambar di Instagram.")}</small>
    </div>
    <div className={ui.field}>
      <div className={ui.fieldHeading}><label htmlFor={`${id}-alt`}>{t("Deskripsi gambar untuk aksesibilitas")}</label><span>{altText.length}{t("/1.000 karakter")}</span></div>
      <textarea id={`${id}-alt`} aria-describedby={`${id}-alt-help`} className={ui.altText} rows={3} maxLength={1000} value={altText} readOnly={!editable} disabled={disabled} onChange={event => onAltText(event.target.value)} />
      <small id={`${id}-alt-help`}>{t("Bantu pembaca layar memahami isi gambar.")}</small>
    </div>
    <section className={`${ui.approval} ${approved ? ui.approved : ""}`} aria-label={t("Persetujuan konten")}>
      <span className={ui.approvalIcon} aria-hidden="true"><ShieldCheck size={25} /></span>
      <div><h4>{t(approvalLabel)}</h4><p>{t("Persetujuan mengikuti revisi konten, sumber, dan gambar final.")}<br />{t("Perubahan konten dapat membatalkan persetujuan.")}</p></div>
    </section>
  </>;
}
