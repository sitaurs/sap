"use client";

import LoadingScreen from "@/components/loading-screen";
import { useI18n } from "../../lib/i18n/provider";


// Instant, branded Suspense fallback shown during the redirect/navigation into
// the dashboard route, before the client dashboard mounts its own bootstrap gate.
export default function DashboardLoading() {
  const { t } = useI18n();
  return <LoadingScreen message={t("Menyiapkan dashboard…")} />;
}
