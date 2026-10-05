import type { Metadata } from "next";
import { getSavedLocale } from "../../lib/i18n/server";
import { translate } from "../../lib/i18n/translate";
import Dashboard from "@/components/dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getSavedLocale();
  return {
    title: translate(locale, "Dashboard | SAP"),
    description: translate(locale, "Pantau aktivitas scan, laporan, dan peta area di Sustainable AI Platform."),
  };
}

export default function DashboardPage() {
  return <Dashboard />;
}
