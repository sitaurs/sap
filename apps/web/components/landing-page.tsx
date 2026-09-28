"use client";

import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, FileText, Leaf, MapPin, Menu, Plus, Send, X } from "lucide-react";
import ImpactHero from "./impact-hero";
import BrandLogo from "./brand-logo";
import PublicMapSection from "./public-map-section";
import { DetailDialog, VerificationAndStories, SiteFooter, type BottomDetail } from "./lower-section";

function Logo() {
  return <a className="logo" href="#beranda" aria-label="SAP Sustainable AI Platform"><BrandLogo className="headerBrandImage" /></a>;
}

function Header() {
  const [open, setOpen] = useState(false);
  return <header className="header"><div className="header-inner"><Logo /><nav className={open ? "nav open" : "nav"} aria-label="Navigasi utama">
    <a href="#beranda" onClick={() => setOpen(false)}>Beranda</a><a href="#cara-kerja" onClick={() => setOpen(false)}>Tentang</a><a href="#fitur" onClick={() => setOpen(false)}>Fitur</a><a href="#peta" onClick={() => setOpen(false)}>Peta Laporan</a><a href="#edukasi" onClick={() => setOpen(false)}>Edukasi</a>
  </nav><a className="login" href="/login">Masuk</a><a className="header-cta" href="/signup">Coba Sekarang</a><button className="menu" type="button" aria-label={open ? "Tutup menu" : "Buka menu"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div></header>;
}

function Workflow() {
  const note = "Contoh: sampah menumpuk di pinggir jalan.";
  return <section id="cara-kerja" className="workflow"><span id="fitur" className="section-anchor" aria-hidden="true" /><div className="section-heading"><h2>Dari foto kecil, untuk <em>lingkungan yang lebih bersih.</em></h2><p>Kenali jenis sampah dengan AI, laporkan penumpukan di sekitar Anda,<br /> dan lihat laporan terverifikasi dari komunitas di peta.</p></div>
    <div className="workflow-content"><div className="scan-visual"><div className="phone-photo" role="img" aria-label="Contoh memotret botol plastik melalui ponsel" /><div className="ai-card"><div className="ai-thumb" /><strong>Botol plastik</strong><span>♧</span><small>✧ Teridentifikasi oleh AI</small></div></div><div className="flow-arrow">⟶</div>
      <div className="form-card"><h3><MapPin size={32} fill="currentColor" />Laporkan penumpukan</h3><div className="upload-area"><div className="bottle-thumb" /><button onClick={() => window.location.assign("/dashboard?view=reports")} type="button"><Plus size={27} />Tambah foto di formulir</button></div><label className="form-row"><MapPin size={21} /><span><small>Lokasi penumpukan</small>Jl. Melati No. 12, Bandung</span></label><label className="form-row"><FileText size={21} /><span><small>Catatan (opsional)</small>{note}</span></label><label className="form-row"><CalendarDays size={21} /><span><small>Waktu kejadian</small>12 Mar 2024, 10.24</span></label><a className="btn primary full" href="#tinjauan">Lihat contoh tinjauan<ChevronRight size={20} /></a></div><div className="flow-arrow">⟶</div>
      <div className="review-card" id="tinjauan"><h3><FileText size={31} fill="currentColor" />Tinjau sebelum kirim</h3><div className="review-box"><div className="review-photo" /><div className="review-info"><p><span className="blue-icon">♧</span><span><strong>Botol plastik</strong><small>Hasil identifikasi AI</small></span></p><p><MapPin size={20} fill="currentColor" className="green-icon" />Jl. Melati No. 12, Bandung</p><p><CalendarDays size={20} />12 Mar 2024, 10.24</p><p><FileText size={20} /><span className="note-preview">{note}</span></p></div></div><div className="review-actions"><a className="btn secondary" href="#cara-kerja">Ubah</a><button className="btn primary" type="button" onClick={() => window.location.assign("/dashboard?view=reports")}><Send size={19} fill="currentColor" />Buat laporan</button></div></div>
    </div><div className="workflow-captions"><div><b>1</b><span><h3>Foto dan kenali</h3><p>Unggah foto sampah, dan AI akan mengenali jenis materialnya secara otomatis.</p></span></div><div><b className="green">2</b><span><h3>Laporkan penumpukan</h3><p>Tambahkan lokasi, waktu, dan catatan untuk membantu tim terkait menindaklanjuti laporan Anda.</p></span></div><div><b>3</b><span><h3>Tinjau sebelum kirim</h3><p>Periksa kembali informasi Anda. Laporan akan ditinjau sebelum ditampilkan di peta.</p></span></div></div><div className="signoff"><Leaf size={21} fill="currentColor" />BERSAMA, KITA JAGA LINGKUNGAN LEBIH BERSIH</div>
  </section>;
}

export default function LandingPage() {
  const [bottomDetail, setBottomDetail] = useState<BottomDetail | null>(null);
  return <><a className="skip-link" href="#beranda">Lewati navigasi</a><Header /><main><ImpactHero /><Workflow /><PublicMapSection /><VerificationAndStories onOpen={setBottomDetail} /></main><SiteFooter onOpen={setBottomDetail} /><DetailDialog detail={bottomDetail} onClose={() => setBottomDetail(null)} /></>;
}
