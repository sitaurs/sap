"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, ChevronRight, Clock3, LockKeyhole, MapPin, X } from "lucide-react";
import styles from "./lower-section.module.css";
import BrandLogo from "./brand-logo";
import MobileStories from "./landing/mobile-stories";
import MobileFooter from "./landing/mobile-footer";
import { mobileStories } from "./landing/content";
import { useI18n } from "../lib/i18n/provider";


const verificationSteps = [
  {
    title: "Laporan dikirim",
    summary: "Foto dan lokasi tetap privat saat menunggu pemeriksaan.",
    detail: "Pelapor menambahkan foto, pin lokasi, waktu kejadian, dan deskripsi. Laporan yang baru dikirim belum tampil di peta publik.",
    href: "#cara-kerja",
    action: "Lihat cara melapor",
  },
  {
    title: "Admin memeriksa",
    summary: "Bukti ditinjau, termasuk kemungkinan laporan duplikat.",
    detail: "Admin meninjau bukti dan memutuskan apakah laporan terverifikasi, ditolak, atau merupakan duplikat. Statusnya dapat dipantau oleh pelapor.",
    href: "#cara-kerja",
    action: "Lihat alur laporan",
  },
  {
    title: "Area tampil di peta",
    summary: "Hanya kejadian terverifikasi yang masuk ringkasan publik.",
    detail: "Peta menampilkan ringkasan per area dan periode. Detail yang dapat dikenali disunting sebelum dipublikasikan; area tanpa laporan diberi status belum ada data.",
    href: "#peta",
    action: "Jelajahi peta",
  },
] as const;

const testimonials = [
  {
    quote: "SAP telah mengubah cara kami mengelola sampah di seluruh kampus. Tingkat diversi kami meningkat 60% dalam waktu 12 bulan saja.",
    name: "Emily Carter",
    role: "Direktur Keberlanjutan",
    company: "Universitas Greenfield",
    image: "emily-carter",
  },
  {
    quote: "Klasifikasi AI sangat akurat dan menghemat berjam-jam pekerjaan manual setiap minggu.",
    name: "James Lee",
    role: "Manajer Operasional",
    company: "CleanCity Solutions",
    image: "james-lee",
  },
  {
    quote: "Data yang jelas dan insight real-time memudahkan kami menunjukkan dampak lingkungan kepada pemangku kepentingan.",
    name: "Sophie Martinez",
    role: "CEO",
    company: "Riverside Health",
    image: "sophie-martinez",
  },
];

const legalLabels = ["Kebijakan Privasi", "Ketentuan Layanan", "Pengaturan Cookie"] as const;

export type BottomDetail =
  | { kind: "testimonial"; index: number; variant?: "mobile" }
  | { kind: "footer"; label: string };

type OpenDetail = (detail: BottomDetail) => void;

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export function VerificationAndStories({ onOpen }: { onOpen: OpenDetail }) {
  const { t } = useI18n();
  const verificationView = useInView<HTMLDivElement>();
  const storiesView = useInView<HTMLDivElement>();
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <section className={styles.section} aria-label={t("Verifikasi laporan dan cerita pelanggan")}>
      <div
        id="verifikasi"
        ref={verificationView.ref}
        className={`${styles.verification} ${verificationView.visible ? styles.visible : ""}`}
      >
        <div className={styles.verificationInner}>
          <p className={styles.eyebrow}>{t("Data yang bisa dipercaya")}</p>
          <h2>{t("Dari laporan ke peta, melalui verifikasi")}{" "}<em>{t("yang jelas.")}</em></h2>
          <p className={styles.mobileIntro}>{t("Setiap laporan melewati pemeriksaan sebelum menjadi informasi publik.")}</p>
          <div className={styles.verificationGrid} aria-label={t("Tahapan verifikasi laporan")}>
            {verificationSteps.map((step, index) => (
              <button
                className={`${styles.verificationCard} ${activeStep === index ? styles.verificationCardActive : ""}`}
                key={t(step.title)}
                type="button"
                onClick={() => setActiveStep(activeStep === index ? null : index)}
                aria-expanded={activeStep === index}
                aria-controls={activeStep === index ? "verification-step-detail" : undefined}
              >
                <span className={styles.verificationCardHeading}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <strong>{t(step.title)}</strong>
                  <ChevronRight className={styles.cardChevron} size={24} aria-hidden="true" />
                </span>
                {index === 0 ? (
                  <span className={styles.reportVisual}>
                    <Image className={styles.desktopArtwork} src="/images/verification/report-photo.png" width={118} height={79} alt={t("Contoh foto tumpukan sampah")} />
                    <Image className={styles.mobileArtwork} src="/images/landing-mobile/report-photo.webp" width={136} height={158} sizes="(max-width: 760px) 35vw, 1px" alt={t("Contoh foto tumpukan sampah")} />
                    <span className={styles.reportMeta}>
                      <span><MapPin size={24} aria-hidden="true" /><span><strong>{t("Lokasi")}</strong><small>{t("Disimpan secara privat")}</small></span></span>
                      <span><Clock3 size={24} aria-hidden="true" /><span><strong>{t("Waktu")}</strong><small>{t("Disimpan secara privat")}</small></span></span>
                    </span>
                  </span>
                ) : index === 1 ? (
                  <span className={styles.reviewVisual}>
                    <Image className={styles.desktopArtwork} src="/images/verification/admin-review.png" width={235} height={95} alt="" />
                    <Image className={styles.mobileArtwork} src="/images/landing-mobile/review-illustration.webp" width={321} height={170} sizes="(max-width: 760px) calc(100vw - 100px), 1px" alt="" />
                  </span>
                ) : (
                  <span className={styles.mapVisual}>
                    <Image className={styles.desktopArtwork} src="/images/verification/verified-area.png" width={264} height={92} alt="" />
                    <Image className={styles.mobileArtwork} src="/images/landing-mobile/verified-area.webp" width={322} height={167} sizes="(max-width: 760px) calc(100vw - 100px), 1px" alt="" />
                  </span>
                )}
                <span className={styles.verificationSummary}>{step.summary}</span>
              </button>
            ))}
          </div>
          {activeStep !== null && (
            <div className={styles.verificationDetail} id="verification-step-detail">
              <span className={styles.detailStepLabel}>{t("Tahap")}{" "}{activeStep + 1}</span>
              <p>{t(verificationSteps[activeStep].detail)}</p>
              <a href={verificationSteps[activeStep].href}>{verificationSteps[activeStep].action} <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          )}
          <p className={styles.privacyNote}><span><LockKeyhole size={23} aria-hidden="true" /></span>{t("Detail foto dan koordinat tidak langsung ditampilkan ke publik.")}</p>
        </div>
      </div>

      <span id="cerita-pelanggan" className={styles.storiesAnchor} aria-hidden="true" />
      <div
        ref={storiesView.ref}
        className={`${styles.stories} ${storiesView.visible ? styles.visible : ""}`}
      >
        <p className={styles.eyebrow}>{t("Cerita pelanggan")}</p>
        <h2>{t("Organisasi membangun masa depan yang lebih berkelanjutan dengan SAP.")}</h2>
        <div className={styles.storyGrid}>
          {testimonials.map((person, index) => (
            <button className={styles.quoteCard} key={person.name} type="button" onClick={() => onOpen({ kind: "testimonial", index })} aria-label={t("Baca cerita {0}", { "0": person.name })}>
              <span className={styles.quoteText}>“{t(person.quote)}”</span>
              <span className={styles.personRow}>
                <Image src={`/images/lower/${person.image}.png`} width={105} height={105} alt="" />
                <span>
                  <strong>{person.name}</strong>
                  <span>{t(person.role)}</span>
                  <span>{t(person.company)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <MobileStories onSelect={index => onOpen({ kind: "testimonial", index, variant: "mobile" })} />
    </section>
  );
}

const footerGroups = [
  { title: "Produk", items: [{ label: "Platform", href: "#beranda" }, { label: "Fitur", href: "#fitur" }, { label: "Verifikasi", href: "#verifikasi" }] },
  { title: "Solusi", items: [{ label: "Keberlanjutan" }, { label: "Manajemen Korporat" }, { label: "Rantai Pasok" }] },
  { title: "Sumber Daya", items: [{ label: "Studi Kasus", href: "#cerita-pelanggan" }, { label: "Blog" }, { label: "Webinar" }] },
  { title: "Perusahaan", items: [{ label: "Tentang Kami", href: "#cara-kerja" }, { label: "Karir" }, { label: "Hubungi Kami" }] },
];

const footerDetails: Record<string, { description: string; href?: string; action?: string }> = {
  Keberlanjutan: { description: "Lihat bagaimana foto, laporan lokasi, dan data terverifikasi membantu tim memahami kondisi lingkungan.", href: "#peta", action: "Jelajahi peta laporan" },
  "Manajemen Korporat": { description: "Pelajari contoh alur pengenalan material, peninjauan laporan, dan koordinasi tim di platform.", href: "#cara-kerja", action: "Lihat cara kerja" },
  "Rantai Pasok": { description: "Jelajahi contoh data lokasi yang dapat menjadi titik awal koordinasi penanganan material.", href: "#peta", action: "Lihat contoh peta" },
  Blog: { description: "Artikel edukasi masih disiapkan. Untuk saat ini, Anda dapat melihat alur pengenalan sampah di halaman ini.", href: "#cara-kerja", action: "Lihat alur pengenalan" },
  Webinar: { description: "Jadwal webinar belum tersedia. Anda dapat menjelajahi contoh fitur dan alur pelaporan terlebih dahulu.", href: "#fitur", action: "Jelajahi fitur" },
  Karir: { description: "Informasi lowongan belum tersedia di landing page ini." },
  "Hubungi Kami": { description: "Informasi kontak resmi belum tersedia di landing page ini." },
  "Kebijakan Privasi": { description: "Dokumen kebijakan privasi resmi belum tersedia pada versi landing page ini." },
  "Ketentuan Layanan": { description: "Dokumen ketentuan layanan resmi belum tersedia pada versi landing page ini." },
  "Pengaturan Cookie": { description: "Landing page ini belum memakai cookie analitik atau iklan. Tidak ada preferensi pelacakan tambahan yang perlu diubah." },
};

export function SiteFooter({ onOpen }: { onOpen: OpenDetail }) {
  const { t } = useI18n();
  return (
    <footer className={styles.footer} id="edukasi">
      <div className={`${styles.footerInner} ${styles.desktopFooter}`}>
        <div className={styles.brandGroup}>
          <a className={styles.footerMark} href="#beranda" aria-label={t("SAP, kembali ke beranda")}><BrandLogo width={140} /></a>
          <div>
            <strong>{t("Bersama untuk masa depan")}<br />{t("yang lebih berkelanjutan.")}</strong>
            <p>{t("Menghubungkan orang, proses, dan data—mengurangi sampah, melestarikan sumber daya, dan menciptakan dampak nyata.")}</p>
          </div>
        </div>
        <nav className={styles.footerNavigation} aria-label={t("Navigasi footer")}>
          {footerGroups.map((group) => (
            <div className={styles.footerGroup} key={group.title}>
              <strong>{t(group.title)}</strong>
              {group.items.map((item) => item.href
                ? <a href={item.href} key={t(item.label)}>{t(item.label)}</a>
                : <button type="button" onClick={() => onOpen({ kind: "footer", label: item.label })} key={t(item.label)}>{t(item.label)}</button>)}
            </div>
          ))}
        </nav>
        <div className={styles.legal}>
          {legalLabels.map((label) =>
            <button type="button" onClick={() => onOpen({ kind: "footer", label })} key={label}>{t(label)}</button>
          )}
        </div>
        <span className={styles.footerLeaf} aria-hidden="true" />
      </div>
      <MobileFooter groups={footerGroups} onOpen={label => onOpen({ kind: "footer", label })} />
    </footer>
  );
}

export function DetailDialog({ detail, onClose }: { detail: BottomDetail | null; onClose: () => void }) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!detail || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [detail]);

  if (!detail) return null;

  let eyebrow: string;
  let title: string;
  let content: ReactNode;

  if (detail.kind === "testimonial") {
    const person = detail.variant === "mobile" ? mobileStories[detail.index] : testimonials[detail.index];
    eyebrow = detail.variant === "mobile" ? "Contoh cerita pelanggan" : "Cerita pelanggan";
    title = person.name;
    content = <>
      <div className={styles.detailPerson}>
        <Image src={`/images/lower/${person.image}.png`} width={105} height={105} alt="" />
        <span>{t(person.role)}<br />{t(person.company)}</span>
      </div>
      <blockquote className={styles.detailQuote}>“{t(person.quote)}”</blockquote>
    </>;
  } else {
    const info = footerDetails[detail.label];
    eyebrow = "Informasi";
    title = t(detail.label);
    content = <>
      <p>{t(info?.description ?? t("Informasi untuk bagian ini sedang disiapkan."))}</p>
      {info?.href && <a className={styles.detailAction} href={info.href} onClick={() => dialogRef.current?.close()}>{t(info.action ?? "Lihat detail")} <ArrowRight size={18} aria-hidden="true" /></a>}
    </>;
  }

  return <dialog
    className={styles.detailDialog}
    ref={dialogRef}
    onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    aria-labelledby="bottom-detail-title"
    aria-describedby="bottom-detail-content"
  >
    <div className={styles.detailContent} id="bottom-detail-content">
      <button className={styles.detailClose} type="button" onClick={() => dialogRef.current?.close()} aria-label={t("Tutup detail")}><X size={22} /></button>
      <p className={styles.detailEyebrow}>{t(eyebrow)}</p>
      <h2 id="bottom-detail-title">{title}</h2>
      {content}
    </div>
  </dialog>;
}
