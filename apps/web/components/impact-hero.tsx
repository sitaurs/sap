"use client";

import { Camera, ChevronRight, Clock3, FileText, MapPin } from "lucide-react";
import styles from "./impact-hero.module.css";
import MobileHeroContent from "./landing/mobile-hero-content";
import { useI18n } from "../lib/i18n/provider";


export default function ImpactHero() {
  const { locale, t } = useI18n();
  return (
    <section className={styles.hero} id="beranda" aria-labelledby="impact-hero-title">
      <div className={styles.frame}>
        <span className={`${styles.shape} ${styles.shapeLeft}`} aria-hidden="true" />
        <span className={`${styles.shape} ${styles.shapeRight}`} aria-hidden="true" />
        <span className={`${styles.leaf} ${styles.leafLeft}`} aria-hidden="true" />
        <span className={`${styles.leaf} ${styles.leafRight}`} aria-hidden="true" />

        <a className={`${styles.card} ${styles.scanCard}`} href="/dashboard?view=scan">
          <span className={`${styles.iconTile} ${styles.cameraTile}`}><Camera size={44} strokeWidth={2.8} aria-hidden="true" /></span>
          <span className={styles.cardCopy}><strong>{t("Scan dari foto")}</strong><span>{t("Kenali jenis material")}</span></span>
          <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
        </a>

        <a className={`${styles.card} ${styles.bottleCard}`} href="/dashboard?view=scan" aria-label={t("Mulai scan sampah, contoh hasil: botol plastik")}>
          <span className={styles.bottlePhoto} aria-hidden="true" />
          <span className={styles.bottleCopy}><strong>{t("Botol plastik")}</strong><span>{t("Contoh hasil scan")}</span></span>
        </a>

        <div className={`${styles.center}${locale === "en" ? ` ${styles.englishCopy}` : ""}`}>
          <p className={styles.mobileEyebrow}>{t("Aksi kecil, dampak besar")}</p>
          <h1 id="impact-hero-title" aria-label={t("Kenali sampah, laporkan lokasi, pahami area.")}>
            {locale === "en" ? (
              <>{t("Kenali sampah,")}<br />{" "}{t("laporkan lokasi,")}<br />{" "}</>
            ) : (
              <>{t("Kenali sampah, laporkan")}<br />{" "}{t("lokasi,")}{" "}</>
            )}
            <span>{t("pahami area.")}</span>
          </h1>
          <p>{t("Dari satu foto, mulai langkah yang lebih tepat")}<br className={styles.desktopBreak} /> {" "}{t("untuk lingkungan sekitar.")}</p>
          <div className={styles.actions}>
            <a className={`${styles.button} ${styles.primary}`} href="/dashboard?view=scan"><Camera className={styles.mobileActionIcon} aria-hidden="true" />{t("Mulai scan")}</a>
            <a className={`${styles.button} ${styles.secondary}`} href="#peta"><MapPin className={styles.mobileActionIcon} aria-hidden="true" />{t("Lihat peta")}</a>
          </div>
        </div>
        <MobileHeroContent />

        <a className={`${styles.card} ${styles.reportCard}`} href="/dashboard?view=reports">
          <span className={styles.reportTop}>
            <span className={`${styles.iconTile} ${styles.reportTile}`}><FileText size={47} strokeWidth={2.4} aria-hidden="true" /></span>
            <strong>{t("Buat laporan")}</strong>
            <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
          </span>
          <span className={styles.reportMeta}><span><Camera aria-hidden="true" />{t("Foto")}</span><i>•</i><span><MapPin aria-hidden="true" />{t("lokasi")}</span><i>•</i><span><Clock3 aria-hidden="true" />{t("waktu")}</span></span>
        </a>

        <a className={`${styles.card} ${styles.mapCard}`} href="#peta">
          <span className={styles.mapTop}>
            <span className={`${styles.iconTile} ${styles.mapTile}`}><MapPin size={43} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /></span>
            <span className={styles.cardCopy}><strong>{t("Peta area")}</strong><span>{t("Laporan terverifikasi")}</span></span>
            <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
          </span>
          <span className={styles.mapPreview} role="img" aria-label={t("Ilustrasi peta area dengan titik laporan")} />
        </a>
        <span className={styles.bottomRim} aria-hidden="true" />
      </div>
    </section>
  );
}
