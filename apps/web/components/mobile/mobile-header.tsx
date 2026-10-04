"use client";

import { Search, UserRound, X } from "lucide-react";
import BrandLogo from "../brand-logo";
import MediaThumbnail from "../media-thumbnail";
import s from "./mobile-navigation.module.css";

export default function MobileHeader({ displayName, avatarMediaId, searchOpen, onSearch, onHome, onAccount }: {
  displayName: string; avatarMediaId: string | null; searchOpen: boolean; onSearch: () => void; onHome: () => void; onAccount: () => void;
}) {
  return <div className={s.mobileHeader}>
    <button type="button" className={s.headerBrand} onClick={onHome} aria-label="Beranda SAP"><BrandLogo width={100} /></button>
    <div className={s.headerActions}>
      <button type="button" className={s.headerIcon} onClick={onSearch} aria-label={searchOpen ? "Tutup pencarian" : "Buka pencarian"} aria-expanded={searchOpen} aria-controls="dashboard-search">{searchOpen ? <X size={22} /> : <Search size={22} />}</button>
      <button type="button" className={s.headerAccount} onClick={onAccount} aria-label={`Akun ${displayName}`}>{avatarMediaId ? <MediaThumbnail mediaId={avatarMediaId} alt={`Foto profil ${displayName}`} className={s.headerPhoto} fallback={<UserRound size={23} aria-hidden="true" />} /> : <UserRound size={23} aria-hidden="true" />}</button>
    </div>
  </div>;
}
