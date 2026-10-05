"use client";

import BrandLogo from "./brand-logo";
import styles from "./loading-screen.module.css";
import { useI18n } from "../lib/i18n/provider";


/**
 * Branded full-screen loader shared by the dashboard route fallback
 * (app/dashboard/loading.tsx) and the dashboard client bootstrap gate, so the
 * user sees the same animated, accessible loader whether the wait is the route
 * transition or the client data fetch — never a static logo alone.
 */
export default function LoadingScreen({ message = "Menyiapkan ruang kerja SAP…" }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.screen} role="status" aria-live="polite" aria-busy="true">
      <BrandLogo width={165} />
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.message}>{t(message)}</span>
    </div>
  );
}
