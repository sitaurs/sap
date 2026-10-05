import { BarChart3, Camera, CircleHelp, Clock3, FileText, Instagram, LayoutDashboard, Leaf, Map, Settings, ShieldCheck, Sliders, Trophy, type LucideIcon } from "lucide-react";

export type AdminTab = "admin-moderation" | "admin-settings" | "admin-instagram" | "admin-activities" | "admin-impact";
export type DashboardTab = "dashboard" | "scan" | "reports" | "activities" | "map" | "history" | "achievements" | "settings" | "help" | "account" | "admin-menu" | AdminTab;
type NavigationItem<T extends DashboardTab = DashboardTab> = { id: T; label: string; icon: LucideIcon; description?: string };

export const mainNav: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "scan", label: "Scan", icon: Camera },
  { id: "reports", label: "Laporan saya", icon: FileText },
  { id: "activities", label: "Relawan", icon: Leaf, description: "Cari kegiatan dan kelola pendaftaran." },
  { id: "map", label: "Peta area", icon: Map },
  { id: "history", label: "Riwayat scan", icon: Clock3 },
  { id: "achievements", label: "Pencapaian", icon: Trophy },
];
export const adminNav: NavigationItem<AdminTab>[] = [
  { id: "admin-moderation", label: "Moderasi laporan", icon: ShieldCheck, description: "Tinjau laporan yang masuk." },
  { id: "admin-activities", label: "Kegiatan relawan", icon: Leaf, description: "Kelola kegiatan dan peserta." },
  { id: "admin-impact", label: "Dampak", icon: BarChart3, description: "Pantau hasil aksi lingkungan." },
  { id: "admin-settings", label: "Pengaturan scan", icon: Sliders, description: "Atur pemindaian dan model AI." },
  { id: "admin-instagram", label: "Publikasi Instagram", icon: Instagram, description: "Kelola draf dan postingan." },
];
export const otherNav: NavigationItem[] = [
  { id: "settings", label: "Pengaturan", icon: Settings },
  { id: "help", label: "Bantuan", icon: CircleHelp },
];
const adminTabs = new Set<DashboardTab>(adminNav.map(item => item.id));
export const isAdminTab = (tab: DashboardTab): tab is AdminTab => adminTabs.has(tab);
export const isMobileMenuTab = (tab: DashboardTab): tab is "account" | "admin-menu" => tab === "account" || tab === "admin-menu";
const allTabs = new Set<DashboardTab>([...mainNav, ...adminNav, ...otherNav].map(item => item.id).concat(["account", "admin-menu"]));
export function requestedDashboardTab(search: string): DashboardTab {
  const requested = new URLSearchParams(search).get("view");
  // Bookmarks for the retired queue open the existing moderation screen.
  if (requested === "admin-reviews" || requested === "admin-community") return "admin-moderation";
  if (requested === "community") return "dashboard";
  return requested && allTabs.has(requested as DashboardTab) ? requested as DashboardTab : "dashboard";
}
