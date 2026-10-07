"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileText, GraduationCap, House, Info, LayoutGrid, Leaf, MapPin, Menu, X } from "lucide-react";
import BrandLogo from "../brand-logo";
import styles from "./landing-header.module.css";
import { useI18n } from "../../lib/i18n/provider";


const links = [
  { label: "Beranda", href: "#beranda", icon: House },
  { label: "Tentang", href: "#cara-kerja", icon: Info },
  { label: "Fitur", href: "#fitur", icon: LayoutGrid },
  { label: "Peta Laporan", href: "#peta", icon: MapPin },
  { label: "Kejadian Publik", href: "/incidents", icon: FileText },
  { label: "Edukasi", href: "#edukasi", icon: GraduationCap },
] as const;

export default function LandingHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("#beranda");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      if (element.open) element.close();
    };
  }, [open]);

  return <>
    <header className="header">
      <div className="header-inner">
        <a className="logo" href="#beranda" aria-label="SAP Sustainable AI Platform"><BrandLogo className="headerBrandImage" /></a>
        <nav className="nav" aria-label={t("Navigasi utama")}>
          {links.map(link => <a key={link.href} href={link.href}>{t(link.label)}</a>)}
        </nav>
        <a className="login" href="/login">{t("Masuk")}</a>
        <a className="header-cta" href="/signup">{t("Coba Sekarang")}</a>
        <button className={`menu ${styles.trigger}`} type="button" aria-label={t("Buka menu")} aria-haspopup="dialog" aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => { setActive(window.location.hash || "#beranda"); setOpen(true); }}><Menu aria-hidden="true" /></button>
      </div>
    </header>
    <dialog ref={dialog} id="landing-mobile-menu" className={styles.menuDialog} aria-labelledby="landing-menu-title" onClose={() => setOpen(false)}>
      <div className={styles.menuHeader}>
        <a href="#beranda" aria-label={t("SAP, kembali ke beranda")} onClick={() => setOpen(false)}><BrandLogo width={140} /></a>
        <button type="button" className={styles.close} aria-label={t("Tutup menu")} onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
      </div>
      <div className={styles.menuBody}>
        <h2 id="landing-menu-title">{t("Jelajahi SAP")}</h2>
        <p className={styles.intro}>{t("Aksi untuk lingkungan dimulai di sini.")}</p>
        <nav className={styles.menuLinks} aria-label={t("Navigasi mobile")}>
          {links.map(({ label, href, icon: Icon }) => <a key={href} href={href} aria-current={active === href ? "location" : undefined} onClick={() => setOpen(false)}>
            <Icon aria-hidden="true" /><span>{t(label)}</span>{active === href && <i className={styles.activeDot} aria-hidden="true" />}<ChevronRight className={styles.chevron} aria-hidden="true" />
          </a>)}
        </nav>
        <div className={styles.authActions}>
          <a href="/signup" className={styles.primary} onClick={() => setOpen(false)}>{t("Coba Sekarang")}</a>
          <a href="/login" className={styles.secondary} onClick={() => setOpen(false)}>{t("Masuk")}</a>
        </div>
        <div className={styles.menuNote}>
          <Leaf aria-hidden="true" />
          <strong>{t("Satu langkah kecil untuk lingkungan yang lebih bersih.")}</strong>
          <span>Sustainable AI Platform</span>
        </div>
      </div>
    </dialog>
  </>;
}
