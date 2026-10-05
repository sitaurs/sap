"use client";

import Image from "next/image";
import { CalendarDays, Camera, FileText, Leaf, MapPin, Send } from "lucide-react";
import styles from "./mobile-workflow.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function MobileWorkflow() {
  const { t } = useI18n();
  return <div className={styles.mobileOnly}>
    <ol className={styles.steps} aria-label={t("Cara membuat laporan SAP")}>
      <li>
        <span className={styles.number} aria-hidden="true">1</span>
        <div className={styles.step}>
          <h3>{t("Foto dan kenali")}</h3><p>{t("Ambil foto atau unggah dari galeri.")}</p>
          <div className={styles.card}>
            <Image className={styles.scanPhoto} src="/images/landing-mobile/bottle-scan.webp" width={338} height={164} sizes="(max-width: 760px) calc(100vw - 92px), 1px" alt={t("Contoh foto botol plastik yang akan dikenali oleh SAP")} />
            <div className={styles.result}>
              <Camera aria-hidden="true" /><span><strong>{t("Botol plastik")}</strong><small>{t("Contoh hasil scan")}</small></span>
              <a href="/dashboard?view=scan" className={styles.upload}>{t("Unggah foto")}</a>
            </div>
          </div>
        </div>
      </li>
      <li>
        <span className={styles.number} aria-hidden="true">2</span>
        <div className={styles.step}>
          <h3>{t("Laporkan penumpukan")}</h3><p>{t("Lengkapi lokasi, waktu, dan catatan.")}</p>
          <div className={`${styles.card} ${styles.form}`}>
            <span className={styles.example}>{t("Contoh tampilan")}</span>
            <dl className={styles.fields}>
              <div><MapPin aria-hidden="true" /><dt>{t("Lokasi")}</dt><dd>Jl. Melati No. 12, Bandung</dd></div>
              <div><CalendarDays aria-hidden="true" /><dt>{t("Waktu kejadian")}</dt><dd>5 Okt 2026, 10.24</dd></div>
              <div><FileText aria-hidden="true" /><dt>{t("Catatan")}</dt><dd>{t("Sampah menumpuk di pinggir jalan.")}</dd></div>
            </dl>
            <a href="#tinjauan-mobile" className={styles.primary}>{t("Lihat contoh tinjauan")}</a>
          </div>
        </div>
      </li>
      <li id="tinjauan-mobile">
        <span className={styles.number} aria-hidden="true">3</span>
        <div className={styles.step}>
          <h3>{t("Tinjau sebelum kirim")}</h3><p>{t("Periksa informasi dan foto Anda.")}</p>
          <div className={`${styles.card} ${styles.form}`}>
            <div className={styles.review}>
              <Image src="/images/landing-mobile/bottle-scan.webp" width={338} height={164} sizes="72px" alt="" />
              <span><strong>{t("Botol plastik")}</strong><small><MapPin aria-hidden="true" />Bandung</small><small>{t("Contoh tinjauan laporan")}</small></span>
            </div>
            <div className={styles.reviewActions}>
              <a href="/dashboard?view=reports" className={styles.secondary}>{t("Ubah")}</a>
              <a href="/dashboard?view=reports" className={styles.primary}><Send aria-hidden="true" />{t("Buat laporan")}</a>
            </div>
          </div>
        </div>
      </li>
    </ol>
    <p className={styles.signoff}><Leaf aria-hidden="true" />{t("Bersama, kita jaga lingkungan.")}</p>
  </div>;
}
