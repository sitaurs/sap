"use client";

import { useState } from "react";
import { CalendarDays, ChevronRight, FileText, Leaf, MapPin, Plus, Send } from "lucide-react";
import ImpactHero from "./impact-hero";
import LandingHeader from "./landing/landing-header";
import MobileWorkflow from "./landing/mobile-workflow";
import mobileStyles from "./landing/landing-mobile.module.css";
import PublicMapSection from "./public-map-section";
import { DetailDialog, VerificationAndStories, SiteFooter, type BottomDetail } from "./lower-section";
import { useI18n } from "../lib/i18n/provider";



function Workflow() {
  const { t } = useI18n();
  const note = "Contoh: sampah menumpuk di pinggir jalan.";
  return <section id="cara-kerja" className="workflow"><span id="fitur" className="section-anchor" aria-hidden="true" /><div data-motion="heading" className="section-heading"><p className="landing-eyebrow">{t("Cara kerja")}</p><h2>{t("Dari foto kecil, untuk")}{" "}<em>{t("lingkungan yang lebih bersih.")}</em></h2><p>{t("Kenali jenis sampah dengan AI, laporkan penumpukan di sekitar Anda,")}<br /> {" "}{t("dan lihat laporan terverifikasi dari komunitas di peta.")}</p></div>
    <MobileWorkflow />
    <div className="workflow-content"><div data-motion="card" className="scan-visual"><div className="phone-photo" role="img" aria-label={t("Contoh memotret botol plastik melalui ponsel")} /><div className="ai-card"><div className="ai-thumb" /><strong>{t("Botol plastik")}</strong><span>♧</span><small>{t("✧ Teridentifikasi oleh AI")}</small></div></div><div className="flow-arrow">⟶</div>
      <div data-motion="card" className="form-card"><h3><MapPin size={32} fill="currentColor" />{t("Laporkan penumpukan")}</h3><div className="upload-area"><div className="bottle-thumb" /><button onClick={() => window.location.assign("/dashboard?view=reports")} type="button"><Plus size={27} />{t("Tambah foto di formulir")}</button></div><label className="form-row"><MapPin size={21} /><span><small>{t("Lokasi penumpukan")}</small>Jl. Melati No. 12, Bandung</span></label><label className="form-row"><FileText size={21} /><span><small>{t("Catatan (opsional)")}</small>{t(note)}</span></label><label className="form-row"><CalendarDays size={21} /><span><small>{t("Waktu kejadian")}</small>12 Mar 2024, 10.24</span></label><a className="btn primary full" href="#tinjauan">{t("Lihat contoh tinjauan")}<ChevronRight size={20} /></a></div><div className="flow-arrow">⟶</div>
      <div data-motion="card" className="review-card" id="tinjauan"><h3><FileText size={31} fill="currentColor" />{t("Tinjau sebelum kirim")}</h3><div className="review-box"><div className="review-photo" /><div className="review-info"><p><span className="blue-icon">♧</span><span><strong>{t("Botol plastik")}</strong><small>{t("Hasil identifikasi AI")}</small></span></p><p><MapPin size={20} fill="currentColor" className="green-icon" />Jl. Melati No. 12, Bandung</p><p><CalendarDays size={20} />12 Mar 2024, 10.24</p><p><FileText size={20} /><span className="note-preview">{note}</span></p></div></div><div className="review-actions"><a className="btn secondary" href="#cara-kerja">{t("Ubah")}</a><button className="btn primary" type="button" onClick={() => window.location.assign("/dashboard?view=reports")}><Send size={19} fill="currentColor" />{t("Buat laporan")}</button></div></div>
    </div><div className="workflow-captions"><div><b>1</b><span><h3>{t("Foto dan kenali")}</h3><p>{t("Unggah foto sampah, dan AI akan mengenali jenis materialnya secara otomatis.")}</p></span></div><div><b className="green">2</b><span><h3>{t("Laporkan penumpukan")}</h3><p>{t("Tambahkan lokasi, waktu, dan catatan untuk membantu tim terkait menindaklanjuti laporan Anda.")}</p></span></div><div><b>3</b><span><h3>{t("Tinjau sebelum kirim")}</h3><p>{t("Periksa kembali informasi Anda. Laporan akan ditinjau sebelum ditampilkan di peta.")}</p></span></div></div><div className="signoff"><Leaf size={21} fill="currentColor" />{t("BERSAMA, KITA JAGA LINGKUNGAN LEBIH BERSIH")}</div>
  </section>;
}

export default function LandingPage() {
  const { t } = useI18n();
  const [bottomDetail, setBottomDetail] = useState<BottomDetail | null>(null);
  return <div className={mobileStyles.root}><a className="skip-link" href="#beranda">{t("Lewati navigasi")}</a><LandingHeader /><main data-motion-scope><ImpactHero /><Workflow /><PublicMapSection /><VerificationAndStories onOpen={setBottomDetail} /></main><SiteFooter onOpen={setBottomDetail} /><DetailDialog detail={bottomDetail} onClose={() => setBottomDetail(null)} /></div>;
}
