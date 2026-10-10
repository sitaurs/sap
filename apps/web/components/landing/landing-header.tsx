"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, FileText, GraduationCap, House, Info, LayoutDashboard, LayoutGrid, Leaf, MapPin, Menu, X } from "lucide-react";
import BrandLogo from "../brand-logo";
import styles from "./landing-header.module.css";
import { useI18n } from "../../lib/i18n/provider";
import { getMe } from "../../lib/api/client";


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
  const [authState, setAuthState] = useState<"checking" | "guest" | "authenticated">("checking");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal)
      .then(() => { if (!controller.signal.aborted) setAuthState("authenticated"); })
      .catch(() => { if (!controller.signal.aborted) setAuthState("guest"); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const syncActive = () => setActive(window.location.hash || "#beranda");
    syncActive();
    window.addEventListener("hashchange", syncActive);
    return () => window.removeEventListener("hashchange", syncActive);
  }, []);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1200px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      if (element.open) element.close();
    };
  }, [open]);

  function authActions(mobile = false) {
    if (authState === "checking") {
      return <span className={mobile ? styles.menuPending : styles.actionPlaceholder} aria-hidden="true" />;
    }
    if (authState === "authenticated") {
      return <a href="/dashboard" className={mobile ? styles.primary : styles.primaryAction} onClick={mobile ? () => setOpen(false) : undefined}>
        <LayoutDashboard aria-hidden="true" />{t("Ke Dashboard")}
      </a>;
    }
    const closeMenu = mobile ? () => setOpen(false) : undefined;
    return mobile ? <>
      <a href="/signup" className={styles.primary} onClick={closeMenu}>{t("Coba Sekarang")}</a>
      <a href="/login" className={styles.secondary} onClick={closeMenu}>{t("Masuk")}</a>
    </> : <>
      <a href="/login" className={styles.loginAction}>{t("Masuk")}</a>
      <a href="/signup" className={styles.primaryAction}>{t("Coba Sekarang")}</a>
    </>;
  }

  return <>
    <header className={styles.header}>
      <div className={styles.bar}>
        <a className={styles.brand} href="#beranda" aria-label={t("SAP Sustainable AI Platform")} onClick={() => setActive("#beranda")}><BrandLogo className={styles.brandImage} /></a>
        <nav className={styles.links} aria-label={t("Navigasi utama")}>
          {links.map(link => <a key={link.href} href={link.href} aria-current={active === link.href ? "location" : undefined} onClick={() => setActive(link.href)}>{t(link.label)}</a>)}
        </nav>
        <div className={`${styles.actions} ${authState === "checking" ? styles.actionsPending : ""}`} aria-busy={authState === "checking"}>
          {authActions()}
        </div>
        <button className={styles.menuTrigger} type="button" aria-label={t("Buka menu")} aria-haspopup="dialog" aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => { setActive(window.location.hash || "#beranda"); setOpen(true); }}><Menu aria-hidden="true" /></button>
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
          {links.map(({ label, href, icon: Icon }) => <a key={href} href={href} aria-current={active === href ? "location" : undefined} onClick={() => { setActive(href); setOpen(false); }}>
            <Icon aria-hidden="true" /><span>{t(label)}</span>{active === href && <i className={styles.activeDot} aria-hidden="true" />}<ChevronRight className={styles.chevron} aria-hidden="true" />
          </a>)}
        </nav>
        <div className={styles.authActions} aria-busy={authState === "checking"}>
          {authActions(true)}
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
