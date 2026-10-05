import type { Metadata } from "next";
import { getSavedLocale } from "../../lib/i18n/server";
import { translate } from "../../lib/i18n/translate";
import AuthPage from "@/components/auth-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getSavedLocale();
  return {
    title: translate(locale, "Masuk | SAP"),
    description: translate(locale, "Masuk ke Sustainable AI Platform untuk melanjutkan aksi peduli lingkungan."),
  };
}

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
