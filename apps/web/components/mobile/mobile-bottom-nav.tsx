"use client";

import { Camera, ChevronRight, CircleHelp, House, Map, FileText, ScanLine, UserRound } from "lucide-react";
import type { DashboardTab } from "./navigation-data";
import s from "./mobile-navigation.module.css";

const tabs = [
  { id: "dashboard", label: "Beranda", icon: House },
  { id: "reports", label: "Laporan", icon: FileText },
  { id: "scan", label: "Scan", icon: Camera },
  { id: "map", label: "Peta", icon: Map },
  { id: "account", label: "Akun", icon: UserRound },
] as const;

export default function MobileBottomNav({ tab, sapaEnabled, onNavigate }: { tab: DashboardTab; sapaEnabled: boolean; onNavigate: (tab: DashboardTab) => void }) {
  const selected = tabs.some(item => item.id === tab) ? tab : "account";
  return <div className={s.dock} data-sap-mobile-dock>
    <nav className={s.bottomNav} aria-label="Navigasi utama mobile">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`${s.navButton} ${id === "scan" ? s.scanButton : ""}`} onClick={() => onNavigate(id)} aria-current={selected === id ? "page" : undefined} aria-label={id === "scan" ? "Scan sampah" : label}>
        {id === "scan" ? <span className={s.scanCircle}><ScanLine size={34} strokeWidth={1.7} aria-hidden="true" /><Camera size={22} className={s.scanCamera} strokeWidth={2} aria-hidden="true" /></span> : <span className={s.navIcon}><Icon size={23} strokeWidth={1.8} aria-hidden="true" /></span>}
        <span className={s.navLabel}>{label}</span>
      </button>)}
    </nav>
    <div className={s.supportSlot}>{!sapaEnabled && <button type="button" className={s.helpFallback} onClick={() => onNavigate("help")}><CircleHelp size={21} aria-hidden="true" /><span>Pusat bantuan SAP</span><ChevronRight size={18} aria-hidden="true" /></button>}</div>
  </div>;
}
