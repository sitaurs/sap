"use client";

import { Search, UserRound, X } from "lucide-react";
import BrandLogo from "../brand-logo";
import MediaThumbnail from "../media-thumbnail";
import s from "./mobile-navigation.module.css";
import { useI18n } from "../../lib/i18n/provider";


export default function MobileHeader({ displayName, avatarMediaId, searchOpen, onSearch, onHome, onAccount }: {
  displayName: string; avatarMediaId: string | null; searchOpen: boolean; onSearch: () => void; onHome: () => void; onAccount: () => void;
}) {
  const { t } = useI18n();
  return <div className={s.mobileHeader}>
    <button type="button" className={s.headerBrand} onClick={onHome} aria-label={t("Beranda SAP")}><BrandLogo width={100} /></button>
    <div className={s.headerActions}>
      <button type="button" className={s.headerIcon} onClick={onSearch} aria-label={searchOpen ? t("Tutup pencarian") : t("Buka pencarian")} aria-expanded={searchOpen} aria-controls="dashboard-search">{searchOpen ? <X size={22} /> : <Search size={22} />}</button>
      <button type="button" className={s.headerAccount} onClick={onAccount} aria-label={t("Akun {0}", { "0": displayName })}>{avatarMediaId ? <MediaThumbnail mediaId={avatarMediaId} alt={t("Foto profil {0}", { "0": displayName })} className={s.headerPhoto} fallback={<UserRound size={23} aria-hidden="true" />} /> : <UserRound size={23} aria-hidden="true" />}</button>
    </div>
  </div>;
}
