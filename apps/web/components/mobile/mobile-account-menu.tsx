"use client";

import { ArrowLeft, ChevronRight, LockKeyhole, LogOut, ShieldCheck, type LucideIcon } from "lucide-react";
import MediaThumbnail from "../media-thumbnail";
import type { SapUser } from "../../lib/api/client";
import { adminNav, mainNav, otherNav, type DashboardTab } from "./navigation-data";
import s from "./mobile-navigation.module.css";

type MenuUser = Pick<SapUser, "displayName" | "role" | "avatarMediaId">;
function MenuRow({ icon: Icon, label, description, onClick }: { icon: LucideIcon; label: string; description?: string; onClick: () => void }) {
  return <button type="button" className={s.menuRow} onClick={onClick}>
    <span className={s.rowIcon}><Icon size={23} strokeWidth={1.9} aria-hidden="true" /></span>
    <span className={s.rowCopy}><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <ChevronRight size={19} className={s.chevron} aria-hidden="true" />
  </button>;
}

export default function MobileAccountMenu({ user, onNavigate, onSignOut, signingOut }: {
  user: MenuUser; onNavigate: (tab: DashboardTab) => void; onSignOut: () => void; signingOut: boolean;
}) {
  const name = user.displayName?.trim() || "Pengguna SAP";
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <section className={`${s.menuPage} ${s.accountMenu}`} aria-labelledby="mobile-account-title">
    <header className={s.pageHeading}><h1 id="mobile-account-title">Akun &amp; menu</h1><p>Semua akses dalam satu tempat.</p></header>
    <button type="button" className={s.profileCard} onClick={() => onNavigate("settings")} aria-label={`Kelola profil ${name}`}>
      <span className={s.profileAvatar}>{user.avatarMediaId ? <MediaThumbnail mediaId={user.avatarMediaId} alt={`Foto profil ${name}`} className={s.avatarPhoto} fallback={initials} /> : initials}</span>
      <span className={s.profileCopy}><strong>{name}</strong><small>{user.role === "admin" ? "Admin SAP" : "Pengguna SAP"}</small></span>
      <span className={s.profileAction}>Kelola profil<ChevronRight size={18} aria-hidden="true" /></span>
    </button>

    <section className={s.menuSection} aria-labelledby="mobile-activity-label">
      <h2 id="mobile-activity-label">Aktivitas saya</h2>
      <div className={s.rowGroup}>{mainNav.filter(item => item.id === "activities" || item.id === "history" || item.id === "achievements").map(item => <MenuRow key={item.id} {...item} onClick={() => onNavigate(item.id)} />)}</div>
    </section>

    {user.role === "admin" && <button type="button" className={s.adminEntry} onClick={() => onNavigate("admin-menu")}>
      <span className={s.rowIcon}><ShieldCheck size={25} aria-hidden="true" /></span>
      <span className={s.rowCopy}><strong>Pusat admin</strong><small>Laporan, kegiatan, dampak, dan publikasi.</small></span>
      <ChevronRight size={20} aria-hidden="true" />
    </button>}

    <section className={s.menuSection} aria-labelledby="mobile-settings-label">
      <h2 id="mobile-settings-label">Pengaturan &amp; bantuan</h2>
      <div className={s.rowGroup}>{otherNav.map(item => <MenuRow key={item.id} {...item} onClick={() => onNavigate(item.id)} />)}</div>
    </section>
    <button type="button" className={s.signOut} disabled={signingOut} onClick={onSignOut}><LogOut size={23} aria-hidden="true" /><span>{signingOut ? "Sedang keluar…" : "Keluar"}</span><ChevronRight size={18} aria-hidden="true" /></button>
  </section>;
}

export function MobileAdminMenu({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: (tab: DashboardTab) => void }) {
  return <section className={s.menuPage} aria-labelledby="mobile-admin-title">
    <header className={`${s.pageHeading} ${s.adminHeading}`}>
      <div><button type="button" className={s.backButton} onClick={() => onNavigate("account")} aria-label="Kembali ke Akun dan menu"><ArrowLeft size={23} /></button><h1 id="mobile-admin-title">Pusat admin</h1>{isAdmin && <span className={s.roleBadge}><ShieldCheck size={14} aria-hidden="true" />Akses admin</span>}</div>
      <p>{isAdmin ? "Kelola layanan dan kegiatan SAP." : "Halaman ini hanya untuk akun admin."}</p>
    </header>
    {isAdmin && <nav className={s.adminCards} aria-label="Menu admin mobile">{adminNav.map(item => <MenuRow key={item.id} {...item} onClick={() => onNavigate(item.id)} />)}</nav>}
    <p className={s.accessNote}><LockKeyhole size={22} aria-hidden="true" /><span>Menu ini tersedia untuk akun admin.</span></p>
  </section>;
}
