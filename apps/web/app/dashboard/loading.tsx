import LoadingScreen from "@/components/loading-screen";

// Instant, branded Suspense fallback shown during the redirect/navigation into
// the dashboard route, before the client dashboard mounts its own bootstrap gate.
export default function DashboardLoading() {
  return <LoadingScreen message="Menyiapkan dashboard…" />;
}
