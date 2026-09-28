import { Camera, ChevronRight, Clock3, FileText, MapPin } from "lucide-react";
import styles from "./impact-hero.module.css";

export default function ImpactHero() {
  return (
    <section className={styles.hero} id="beranda" aria-labelledby="impact-hero-title">
      <div className={styles.frame}>
        <span className={`${styles.shape} ${styles.shapeLeft}`} aria-hidden="true" />
        <span className={`${styles.shape} ${styles.shapeRight}`} aria-hidden="true" />
        <span className={`${styles.leaf} ${styles.leafLeft}`} aria-hidden="true" />
        <span className={`${styles.leaf} ${styles.leafRight}`} aria-hidden="true" />

        <a className={`${styles.card} ${styles.scanCard}`} href="/dashboard?view=scan">
          <span className={`${styles.iconTile} ${styles.cameraTile}`}><Camera size={44} strokeWidth={2.8} aria-hidden="true" /></span>
          <span className={styles.cardCopy}><strong>Scan dari foto</strong><span>Kenali jenis material</span></span>
          <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
        </a>

        <a className={`${styles.card} ${styles.bottleCard}`} href="/dashboard?view=scan" aria-label="Mulai scan sampah, contoh hasil: botol plastik">
          <span className={styles.bottlePhoto} aria-hidden="true" />
          <span className={styles.bottleCopy}><strong>Botol plastik</strong><span>Contoh hasil scan</span></span>
        </a>

        <div className={styles.center}>
          <h1 id="impact-hero-title">Kenali sampah, laporkan<br />lokasi, <span>pahami area.</span></h1>
          <p>Dari satu foto, mulai langkah yang lebih tepat<br className={styles.desktopBreak} /> untuk lingkungan sekitar.</p>
          <div className={styles.actions}>
            <a className={`${styles.button} ${styles.primary}`} href="/dashboard?view=scan">Mulai scan</a>
            <a className={`${styles.button} ${styles.secondary}`} href="#peta">Lihat peta</a>
          </div>
        </div>

        <a className={`${styles.card} ${styles.reportCard}`} href="/dashboard?view=reports">
          <span className={styles.reportTop}>
            <span className={`${styles.iconTile} ${styles.reportTile}`}><FileText size={47} strokeWidth={2.4} aria-hidden="true" /></span>
            <strong>Buat laporan</strong>
            <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
          </span>
          <span className={styles.reportMeta}><span><Camera aria-hidden="true" />Foto</span><i>•</i><span><MapPin aria-hidden="true" />lokasi</span><i>•</i><span><Clock3 aria-hidden="true" />waktu</span></span>
        </a>

        <a className={`${styles.card} ${styles.mapCard}`} href="#peta">
          <span className={styles.mapTop}>
            <span className={`${styles.iconTile} ${styles.mapTile}`}><MapPin size={43} fill="currentColor" strokeWidth={1.5} aria-hidden="true" /></span>
            <span className={styles.cardCopy}><strong>Peta area</strong><span>Laporan terverifikasi</span></span>
            <ChevronRight className={styles.cardArrow} size={29} aria-hidden="true" />
          </span>
          <span className={styles.mapPreview} role="img" aria-label="Ilustrasi peta area dengan titik laporan" />
        </a>
        <span className={styles.bottomRim} aria-hidden="true" />
      </div>
    </section>
  );
}
