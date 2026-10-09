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

type LegalSection = { heading: string; paragraphs: readonly string[]; bullets?: readonly string[] };
type LegalDocument = { notice: string; intro: string; sections: readonly LegalSection[] };

const legalDocuments: Record<string, LegalDocument> = {
  "Kebijakan Privasi": {
    notice: "DRAF UNTUK DITINJAU · 8 OKTOBER 2026. Nama badan hukum pengelola, kontak resmi, dan jadwal retensi rinci perlu dikonfirmasi sebelum dokumen ini ditetapkan sebagai kebijakan final.",
    intro: "Kebijakan ini menjelaskan bagaimana Sustainable AI Platform (SAP) mengumpulkan, menggunakan, menyimpan, dan membagikan data saat Anda memakai situs dan layanan SAP.",
    sections: [
      { heading: "Data yang diproses", paragraphs: ["Bergantung pada fitur yang Anda gunakan, SAP dapat memproses nama tampilan, alamat email, kredensial autentikasi yang tersimpan dalam bentuk terlindungi, status verifikasi akun, preferensi keamanan/MFA, serta informasi sesi dan perangkat yang diperlukan untuk keamanan layanan.", "Untuk scan dan laporan, SAP dapat memproses foto, hasil identifikasi otomatis, kategori, deskripsi, waktu pengamatan, lokasi yang Anda pilih, komentar atau pembaruan warga, serta riwayat status dan keputusan moderasi. Jika Anda menghubungi SAPA, pesan dan konteks yang Anda berikan diproses untuk menjawab permintaan tersebut.", "Unggahan gambar dinormalisasi sebelum disimpan; metadata gambar seperti koordinat EXIF dihapus dari hasil pemrosesan. SAP tetap dapat menyimpan koordinat yang Anda pilih secara terpisah untuk memeriksa dan mengelola laporan."] },
      { heading: "Tujuan penggunaan", paragraphs: ["Data digunakan untuk membuat dan mengamankan akun, menerima scan/laporan, membantu klasifikasi material, menampilkan status dan peta, menghubungkan warga dengan kegiatan, memoderasi konten, menyediakan dukungan SAPA, mencegah penyalahgunaan, memelihara layanan, dan memenuhi kewajiban yang berlaku.", "Fitur otomatis dan AI dapat membantu mengenali material atau menyusun rekomendasi bagi moderator. Hasil otomatis bukan keputusan final dan dapat keliru; keputusan publikasi dan moderasi tetap mengikuti alur serta pemeriksaan manusia yang berlaku."] },
      { heading: "Data privat dan informasi publik", paragraphs: ["Koordinat presisi, foto mentah, dan rincian laporan tidak otomatis menjadi informasi publik. Laporan yang memenuhi syarat dapat menampilkan ringkasan serta area geografis yang digeneralisasi. Foto hanya dapat dipublikasikan pada kanal tertentu setelah izin kanal yang sesuai diberikan dan moderator menyetujui bukti tersebut.", "Persetujuan untuk web dan Instagram terpisah. Publikasi Instagram memerlukan proses persetujuan dan tindakan admin; setelah dipublikasikan, konten dapat disalin atau disimpan pihak lain. Pencabutan izin menghentikan penggunaan baru dan memulai proses penarikan yang didukung, tetapi tidak selalu dapat menghapus salinan pihak ketiga atau menjamin penghapusan seketika."] },
      { heading: "Penerima data", paragraphs: ["Akses internal dibatasi sesuai tugas, misalnya untuk moderator dan pengelola layanan. SAP juga dapat menggunakan penyedia hosting, basis data, penyimpanan berkas, pengiriman email, keamanan, dan pemrosesan AI yang diperlukan untuk menjalankan fitur. Data hanya dibagikan sejauh diperlukan untuk tujuan layanan dan sesuai konfigurasi penyedia.", "Jika Anda meminta publikasi Instagram dan konten disetujui serta diterbitkan, media dan informasi publikasi yang diperlukan akan dikirim ke Meta/Instagram. Konten publik dapat dilihat pengguna internet. Layanan pihak ketiga tunduk pula pada ketentuan dan kebijakan privasi mereka sendiri.", "Sebagian penyedia mungkin memproses data dari luar Indonesia. Pengelola perlu memastikan lokasi pemrosesan, perlindungan transfer, daftar penyedia, dan pengaturan kontraktual sebelum draf ini disahkan."] },
      { heading: "Penyimpanan dan penghapusan", paragraphs: ["Data disimpan selama diperlukan untuk menyediakan layanan, menjaga keamanan, menangani moderasi, menyelesaikan sengketa, dan memenuhi kewajiban yang berlaku. Jadwal retensi spesifik untuk setiap kategori data dan cadangan perlu ditetapkan oleh pengelola.", "Anda dapat mengajukan penghapusan akun dari Pengaturan. Permintaan yang diterima segera menonaktifkan akun dan sesi, lalu memasukkan penghapusan ke proses pembersihan. Data atau catatan terbatas mungkin tetap disimpan sejauh diperlukan untuk keamanan, audit, penyelesaian permintaan yang berjalan, atau kewajiban hukum; pengelola harus menetapkan batas dan jadwalnya secara transparan."] },
      { heading: "Pilihan dan hak Anda", paragraphs: ["Anda dapat memperbarui informasi akun melalui fitur yang tersedia, memilih secara terpisah apakah bukti boleh digunakan pada kanal publik, dan mengajukan pencabutan izin atau permintaan terkait data kepada pengelola SAP. Permintaan dapat memerlukan verifikasi identitas untuk mencegah akses tanpa hak. Hak dan pengecualian mengikuti peraturan yang berlaku.", "Jangan unggah data pribadi orang lain, wajah, dokumen identitas, atau informasi sensitif yang tidak diperlukan. Pastikan Anda berhak mengirim foto dan informasi yang Anda berikan."] },
      { heading: "Keamanan dan cookie", paragraphs: ["SAP menerapkan kontrol teknis dan operasional yang dirancang untuk membatasi akses, melindungi sesi, mengamankan unggahan, dan mengurangi data sensitif pada log. Tidak ada sistem yang dapat dijamin bebas risiko; segera hubungi pengelola jika Anda menduga akun atau data disalahgunakan.", "Cookie dan penyimpanan browser digunakan untuk fungsi yang diperlukan, seperti sesi login, perlindungan permintaan, dan pilihan bahasa. Versi landing page ini tidak memasang cookie analitik atau iklan berdasarkan pemeriksaan kode saat draf dibuat. Perubahan fitur atau penyedia dapat mengubah praktik tersebut dan perlu diperbarui dalam pemberitahuan ini."] },
      { heading: "Perubahan dan dasar rujukan", paragraphs: ["Perubahan penting pada kebijakan akan ditampilkan melalui SAP. Draf ini disusun sebagai dasar informasi pengguna dan tetap memerlukan pemeriksaan pengelola serta penasihat hukum sebelum diberlakukan sebagai kebijakan resmi."] },
    ],
  },
  "Ketentuan Layanan": {
    notice: "DRAF UNTUK DITINJAU · 8 OKTOBER 2026. Identitas badan hukum pengelola, kontak resmi, dan yurisdiksi penyelesaian sengketa perlu dikonfirmasi sebelum dokumen ini ditetapkan sebagai ketentuan final.",
    intro: "Ketentuan ini mengatur penggunaan SAP, termasuk fitur scan, laporan lingkungan, kontribusi warga, kegiatan relawan, SAPA, dan publikasi Instagram.",
    sections: [
      { heading: "Akun dan penggunaan yang wajar", paragraphs: ["Berikan informasi akun yang benar, jaga kerahasiaan kata sandi dan kode pemulihan, serta segera amankan akun jika ada dugaan akses tanpa izin. Anda bertanggung jawab atas aktivitas yang dilakukan melalui sesi akun Anda.", "Gunakan SAP secara sah dan dengan itikad baik. Dilarang mengirim laporan palsu dengan sengaja, mengganggu layanan, mencoba mengakses data orang lain, mengunggah malware, melecehkan orang, atau menggunakan SAP untuk melanggar hak dan keselamatan pihak lain."] },
      { heading: "Laporan, foto, dan kontribusi warga", paragraphs: ["Kirim informasi yang akurat sejauh pengetahuan Anda dan tandai perkiraan sebagai perkiraan. Anda menyatakan memiliki hak atau izin yang diperlukan atas foto, teks, dan materi yang dikirim serta tidak memasukkan informasi pribadi orang lain yang tidak diperlukan.", "Anda tetap memiliki hak atas materi yang Anda kirim. Untuk menjalankan layanan, Anda memberi SAP izin terbatas, non-eksklusif, dan selama diperlukan untuk menyimpan, memproses, meninjau, serta menampilkan materi kepada Anda dan moderator. Izin untuk menampilkan materi kepada publik hanya berlaku jika persetujuan kanal diberikan secara terpisah dan moderator menyetujuinya.", "SAP dapat membatasi, menyamarkan, meminta perbaikan, atau menolak materi yang tidak aman, melanggar hak, tidak relevan, atau tidak memenuhi standar bukti. Pengiriman laporan tidak menjamin laporan diverifikasi, ditangani pada jangka waktu tertentu, atau menghasilkan tindakan dari pihak lain."] },
      { heading: "AI, peta, dan informasi publik", paragraphs: ["Hasil identifikasi material, ringkasan, rekomendasi Hermes, dan jawaban SAPA dapat tidak lengkap atau salah. Gunakan sebagai bantuan, bukan pengganti penilaian profesional, instruksi darurat, atau keputusan moderator. SAP tidak menjamin setiap laporan atau jawaban akan ditinjau dalam waktu tertentu.", "Peta dan kronologi publik dapat menggunakan ringkasan serta area lokasi yang digeneralisasi. Jangan mengandalkannya sebagai koordinat navigasi, pernyataan resmi pemerintah, atau bukti bahwa area tanpa laporan bebas masalah. Untuk keadaan darurat, hubungi layanan darurat atau otoritas setempat."] },
      { heading: "Kegiatan relawan", paragraphs: ["Informasi kegiatan, kapasitas, titik kumpul, dan instruksi dapat berubah. Ikuti arahan koordinator, aturan lokasi, dan ketentuan keselamatan. Jangan melakukan aktivitas yang berbahaya atau di luar kemampuan Anda; hentikan partisipasi dan laporkan kondisi tidak aman kepada koordinator.", "SAP adalah sarana koordinasi dan tidak menjamin ketersediaan kegiatan, penerimaan pendaftaran, hasil lingkungan, atau tindakan pengelola lokasi. Poin dan lencana, bila tersedia, adalah fitur pencatatan partisipasi sesuai aturan program; bukan uang, aset, atau jaminan hadiah kecuali suatu program secara tegas menyatakan sebaliknya."] },
      { heading: "Publikasi Instagram dan layanan pihak ketiga", paragraphs: ["Draf Instagram bukan posting yang sudah terbit. Publikasi hanya dilakukan setelah syarat bukti dan izin terpenuhi, konten ditinjau serta disetujui admin, akun Instagram yang diperlukan terhubung, dan admin menjalankan tindakan publikasi. Meta/Instagram dapat menolak, membatasi, atau menghapus konten berdasarkan kebijakan mereka.", "Tautan atau integrasi pihak ketiga memiliki ketentuan sendiri. SAP tidak mengendalikan ketersediaan maupun kebijakan layanan tersebut. Penarikan melalui SAP memulai proses yang didukung, tetapi salinan, cache, tangkapan layar, atau unggahan ulang pihak lain mungkin tetap ada."] },
      { heading: "Ketersediaan, pembatasan, dan perubahan", paragraphs: ["SAP dapat mengalami pemeliharaan, gangguan, atau perubahan fitur. Pengelola dapat membatasi akses sementara atau menangguhkan akun jika diperlukan untuk keamanan, kepatuhan, investigasi penyalahgunaan, atau perlindungan pengguna, dengan mempertimbangkan pemberitahuan dan peninjauan yang wajar.", "Pengelola dapat memperbarui layanan dan ketentuan ini. Perubahan material akan diberitahukan melalui platform bila memungkinkan. Penggunaan setelah tanggal berlakunya perubahan tunduk pada ketentuan yang diperbarui, sepanjang diperbolehkan oleh hukum."] },
      { heading: "Penghapusan akun dan pertanyaan", paragraphs: ["Anda dapat meminta penghapusan akun melalui Pengaturan. Permintaan memerlukan konfirmasi keamanan, menonaktifkan akun dan sesi, lalu diproses melalui antrean penghapusan. Penghapusan dari SAP tidak otomatis menarik salinan yang sudah diterbitkan oleh pihak ketiga.", "Untuk pertanyaan, laporan pelanggaran, atau permintaan terkait akun dan data, hubungi pengelola melalui kanal bantuan yang tersedia di SAP. Identitas badan hukum, kontak resmi, serta aturan hukum dan penyelesaian sengketa harus dilengkapi sebelum draf ini ditetapkan sebagai ketentuan resmi."] },
    ],
  },
};

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
  "Pengaturan Cookie": { description: "Cookie dan penyimpanan browser mendukung sesi login, perlindungan permintaan, dan pilihan bahasa. Landing page tidak memasang cookie analitik atau iklan pada versi ini." },
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
    const legal = legalDocuments[detail.label];
    eyebrow = "Informasi";
    title = t(detail.label);
    content = legal ? <div className={styles.legalDocument}>
      <p className={styles.legalDraftNotice} role="note">{legal.notice}</p>
      <p className={styles.legalIntro}>{legal.intro}</p>
      <div className={styles.legalSections}>
        {legal.sections.map(section => <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>)}
        {detail.label === "Kebijakan Privasi" && <p className={styles.legalReferences}>Rujukan untuk pemeriksaan: <a href="https://peraturan.bpk.go.id/Details/229798/uu-no-27-" target="_blank" rel="noreferrer">UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi</a> dan <a href="https://peraturan.bpk.go.id/Home/Details/122030/pp-no-71-" target="_blank" rel="noreferrer">PP No. 71 Tahun 2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik</a>.</p>}
      </div>
    </div> : <>
      <p>{t(info?.description ?? t("Informasi untuk bagian ini sedang disiapkan."))}</p>
      {info?.href && <a className={styles.detailAction} href={info.href} onClick={() => dialogRef.current?.close()}>{t(info.action ?? "Lihat detail")} <ArrowRight size={18} aria-hidden="true" /></a>}
    </>;
  }

  return <dialog
    data-motion="dialog"
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
