"use client";

import Image from "next/image";
import { Camera, ChevronDown, FileText, GraduationCap, MapPin } from "lucide-react";
import styles from "./mobile-hero-content.module.css";
import { useI18n } from "../../lib/i18n/provider";


const features = [
  { title: "Scan dari foto", description: "Kenali jenis material", href: "/dashboard?view=scan", icon: Camera, green: false },
  { title: "Buat laporan", description: "Foto, lokasi, dan waktu", href: "/dashboard?view=reports", icon: FileText, green: true },
  { title: "Peta area", description: "Laporan terverifikasi", href: "#peta", icon: MapPin, green: false },
  { title: "Edukasi", description: "Belajar memilah sampah", href: "#edukasi", icon: GraduationCap, green: true },
] as const;

export default function MobileHeroContent() {
  const { t } = useI18n();
  return <div className={styles.content}>
    <div className={styles.photo}>
      <Image src="/images/landing-mobile/hero-camera.webp" alt={t("Ilustrasi memotret botol plastik dengan kamera SAP. Contoh hasil scan: botol plastik.")} width={441} height={396} sizes="(max-width: 760px) calc(100vw - 48px), 1px" loading="eager" />
    </div>
    <p className={styles.eyebrow}>{t("Kenali fitur SAP")}</p>
    <div className={styles.features}>
      {features.map(({ title, description, href, icon: Icon, green }) => <a key={title} className={styles.feature} href={href}>
        <span className={`${styles.icon} ${green ? styles.green : ""}`}><Icon aria-hidden="true" /></span>
        <strong>{t(title)}</strong><span className={styles.description}>{t(description)}</span>
      </a>)}
    </div>
    <a href="#cara-kerja" className={styles.learn}><ChevronDown aria-hidden="true" /><span>{t("Pelajari cara kerjanya")}</span></a>
  </div>;
}
