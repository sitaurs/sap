"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, ChevronRight, Clock3, LockKeyhole, MapPin, X } from "lucide-react";
import styles from "./lower-section.module.css";
import BrandLogo from "./brand-logo";

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

export type BottomDetail =
  | { kind: "testimonial"; index: number }
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
  const verificationView = useInView<HTMLDivElement>();
  const storiesView = useInView<HTMLDivElement>();
  const [activeStep, setActiveStep] = useState<number | null>(null);

  return (
    <section className={styles.section} aria-label="Verifikasi laporan dan cerita pelanggan">
      <div
        id="verifikasi"
        ref={verificationView.ref}
        className={`${styles.verification} ${verificationView.visible ? styles.visible : ""}`}
      >
        <div className={styles.verificationInner}>
          <p className={styles.eyebrow}>Data yang bisa dipercaya</p>
          <h2>Dari laporan ke peta, melalui verifikasi <em>yang jelas.</em></h2>
          <div className={styles.verificationGrid} aria-label="Tahapan verifikasi laporan">
            {verificationSteps.map((step, index) => (
              <button
                className={`${styles.verificationCard} ${activeStep === index ? styles.verificationCardActive : ""}`}
                key={step.title}
                type="button"
                onClick={() => setActiveStep(activeStep === index ? null : index)}
                aria-expanded={activeStep === index}
                aria-controls={activeStep === index ? "verification-step-detail" : undefined}
              >
                <span className={styles.verificationCardHeading}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <strong>{step.title}</strong>
                  <ChevronRight className={styles.cardChevron} size={24} aria-hidden="true" />
                </span>
                {index === 0 ? (
                  <span className={styles.reportVisual}>
                    <Image src="/images/verification/report-photo.png" width={118} height={79} alt="Contoh foto tumpukan sampah" />
                    <span className={styles.reportMeta}>
                      <span><MapPin size={24} aria-hidden="true" /><span><strong>Lokasi</strong><small>Disimpan secara privat</small></span></span>
                      <span><Clock3 size={24} aria-hidden="true" /><span><strong>Waktu</strong><small>Disimpan secara privat</small></span></span>
                    </span>
                  </span>
                ) : index === 1 ? (
                  <span className={styles.reviewVisual}>
                    <Image src="/images/verification/admin-review.png" width={235} height={95} alt="" />
                  </span>
                ) : (
                  <span className={styles.mapVisual}>
                    <Image src="/images/verification/verified-area.png" width={264} height={92} alt="" />
                  </span>
                )}
                <span className={styles.verificationSummary}>{step.summary}</span>
              </button>
            ))}
          </div>
          {activeStep !== null && (
            <div className={styles.verificationDetail} id="verification-step-detail">
              <span className={styles.detailStepLabel}>Tahap {activeStep + 1}</span>
              <p>{verificationSteps[activeStep].detail}</p>
              <a href={verificationSteps[activeStep].href}>{verificationSteps[activeStep].action} <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
          )}
          <p className={styles.privacyNote}><span><LockKeyhole size={23} aria-hidden="true" /></span>Detail foto dan koordinat tidak langsung ditampilkan ke publik.</p>
        </div>
      </div>

      <div
        id="cerita-pelanggan"
        ref={storiesView.ref}
        className={`${styles.stories} ${storiesView.visible ? styles.visible : ""}`}
      >
        <p className={styles.eyebrow}>Cerita pelanggan</p>
        <h2>Organisasi membangun masa depan yang lebih berkelanjutan dengan SAP.</h2>
        <div className={styles.storyGrid}>
          {testimonials.map((person, index) => (
            <button className={styles.quoteCard} key={person.name} type="button" onClick={() => onOpen({ kind: "testimonial", index })} aria-label={`Baca cerita ${person.name}`}>
              <span className={styles.quoteText}>“{person.quote}”</span>
              <span className={styles.personRow}>
                <Image src={`/images/lower/${person.image}.png`} width={105} height={105} alt="" />
                <span>
                  <strong>{person.name}</strong>
                  <span>{person.role}</span>
                  <span>{person.company}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
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
  return (
    <footer className={styles.footer} id="edukasi">
      <div className={styles.footerInner}>
        <div className={styles.brandGroup}>
          <a className={styles.footerMark} href="#beranda" aria-label="SAP, kembali ke beranda"><BrandLogo width={140} /></a>
          <div>
            <strong>Bersama untuk masa depan<br />yang lebih berkelanjutan.</strong>
            <p>Menghubungkan orang, proses, dan data—mengurangi sampah, melestarikan sumber daya, dan menciptakan dampak nyata.</p>
          </div>
        </div>
        <nav className={styles.footerNavigation} aria-label="Navigasi footer">
          {footerGroups.map((group) => (
            <div className={styles.footerGroup} key={group.title}>
              <strong>{group.title}</strong>
              {group.items.map((item) => item.href
                ? <a href={item.href} key={item.label}>{item.label}</a>
                : <button type="button" onClick={() => onOpen({ kind: "footer", label: item.label })} key={item.label}>{item.label}</button>)}
            </div>
          ))}
        </nav>
        <div className={styles.legal}>
          {["Kebijakan Privasi", "Ketentuan Layanan", "Pengaturan Cookie"].map((label) =>
            <button type="button" onClick={() => onOpen({ kind: "footer", label })} key={label}>{label}</button>
          )}
        </div>
        <span className={styles.footerLeaf} aria-hidden="true" />
      </div>
    </footer>
  );
}

export function DetailDialog({ detail, onClose }: { detail: BottomDetail | null; onClose: () => void }) {
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
    const person = testimonials[detail.index];
    eyebrow = "Cerita pelanggan";
    title = person.name;
    content = <>
      <div className={styles.detailPerson}>
        <Image src={`/images/lower/${person.image}.png`} width={105} height={105} alt="" />
        <span>{person.role}<br />{person.company}</span>
      </div>
      <blockquote className={styles.detailQuote}>“{person.quote}”</blockquote>
    </>;
  } else {
    const info = footerDetails[detail.label];
    eyebrow = "Informasi";
    title = detail.label;
    content = <>
      <p>{info?.description ?? "Informasi untuk bagian ini sedang disiapkan."}</p>
      {info?.href && <a className={styles.detailAction} href={info.href} onClick={() => dialogRef.current?.close()}>{info.action} <ArrowRight size={18} aria-hidden="true" /></a>}
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
      <button className={styles.detailClose} type="button" onClick={() => dialogRef.current?.close()} aria-label="Tutup detail"><X size={22} /></button>
      <p className={styles.detailEyebrow}>{eyebrow}</p>
      <h2 id="bottom-detail-title">{title}</h2>
      {content}
    </div>
  </dialog>;
}
