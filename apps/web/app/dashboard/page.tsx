import type { Metadata } from "next";
import Dashboard from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Dashboard | SAP",
  description: "Pantau aktivitas scan, laporan, dan peta area di Sustainable AI Platform.",
};

export default function DashboardPage() {
  return <Dashboard />;
}
