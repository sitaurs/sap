"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Check, ChevronRight, Copy, Leaf, MoreVertical, Search } from "lucide-react";
import BrandLogo from "../brand-logo";
import { useI18n } from "../../lib/i18n/provider";
import p from "./public-community.module.css";

export function PublicHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const activities = pathname.startsWith("/activities");
  const searchTarget = activities ? "/activities#cari-kegiatan" : "/incidents#cari-kejadian";
  return <header className={p.header}>
    <Link href="/" className={p.brand} aria-label={t("Beranda SAP")}><BrandLogo width={112} /></Link>
    <nav className={p.navigation} aria-label={t("Navigasi publik")}>
      <Link href="/incidents" aria-current={pathname.startsWith("/incidents") ? "page" : undefined}>{t("Kejadian publik")}</Link>
      <Link href="/activities" aria-current={activities ? "page" : undefined}>{t("Kegiatan relawan")}</Link>
      <Link href="/#cara-kerja">{t("Tentang SAP")}</Link>
    </nav>
    <div className={p.headerActions}>
      <a className={p.iconButton} href={searchTarget} aria-label={activities ? t("Cari kegiatan") : t("Cari kejadian")}><Search size={18} aria-hidden="true" /></a>
      <Link className={p.dashboardLink} href="/dashboard">{t("Dashboard")}<ArrowUpRight size={15} aria-hidden="true" /></Link>
    </div>
  </header>;
}

export function CommunityHero({ variant, title, children }: { variant: "incidents" | "activities"; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const activities = variant === "activities";
  return <header className={[p.hero, activities ? p.activityHero : p.incidentHero].join(" ")}>
    <div className={p.heroText}>
      <span className={p.eyebrow}>{t("SAP · Aksi warga")}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
    <div className={p.heroArt} aria-hidden="true">
      <Image src={activities ? "/images/community/volunteer-hero.webp" : "/images/community/incidents-river.webp"} alt="" fill sizes="(max-width: 680px) 90vw, (max-width: 1100px) 42vw, 510px" preload />
    </div>
  </header>;
}

export function CardOptions({ href, title }: { href: string; title: string }) {
  const { t } = useI18n();
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      setFeedback(t("Tautan berhasil disalin."));
    } catch { setFeedback(t("Tautan belum dapat disalin. Buka detail untuk menyalinnya dari alamat browser.")); }
    if (details.current) {
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    }
  }
  return <div className={p.options}>
    <details ref={details} onToggle={(event) => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setFeedback(""); }}>
      <summary aria-label={t("Opsi untuk {title}", { title })}><MoreVertical size={18} aria-hidden="true" /></summary>
      <div className={p.optionsPanel}>
        <Link href={href}><ChevronRight size={16} aria-hidden="true" />{t("Lihat detail")}</Link>
        <button type="button" onClick={() => void copy()}><Copy size={16} aria-hidden="true" />{t("Salin tautan")}</button>
      </div>
    </details>
    <span className={p.srOnly} role="status">{feedback}</span>
  </div>;
}

export function ActivityIllustration({ id, title, description }: { id: string; title: string; description: string }) {
  const { t } = useI18n();
  const subject = title + " " + description;
  const illustrations = ["cleanup-closeup.webp", "tree-planting.webp", "community-cleanup.webp"];
  const seed = Array.from(id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  const image = /pohon|bibit|tanam|plant|tree|seedling/i.test(subject) ? "tree-planting.webp" : /sungai|bantaran|komunitas|river|community/i.test(subject) ? "community-cleanup.webp" : /sampah|bersih|waste|clean|trash|rubbish/i.test(subject) ? "cleanup-closeup.webp" : illustrations[seed % illustrations.length];
  return <div className={p.activityImage}>
    <Image src={"/images/community/" + image} alt="" fill sizes="(max-width: 680px) 90vw, (max-width: 1100px) 43vw, 550px" />
    <span>{t("Ilustrasi kegiatan")}</span>
  </div>;
}

export function ListSkeleton({ activities = false }: { activities?: boolean }) {
  return <div className={p.cardGrid} aria-hidden="true">{[0, 1, 2, 3].map((item) => <div className={[p.listCard, p.skeletonCard].join(" ")} key={item}>
    <div className={p.skeletonBadge} />
    {activities && <div className={p.skeletonImage} />}
    <div className={p.skeletonTitle} /><div className={p.skeletonLine} /><div className={p.skeletonLine} /><div className={p.skeletonButton} />
  </div>)}</div>;
}

export function ExploreEmpty({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  const { t } = useI18n();
  return <div className={p.emptyState}>
    <span className={p.emptyIcon}><Leaf size={28} aria-hidden="true" /></span>
    <h2>{title}</h2><p>{children}</p>
    {onReset && <button type="button" className={p.secondaryButton} onClick={onReset}><Check size={16} aria-hidden="true" />{t("Reset filter")}</button>}
  </div>;
}
