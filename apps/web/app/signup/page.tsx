import type { Metadata } from "next";
import { getSavedLocale } from "../../lib/i18n/server";
import { translate } from "../../lib/i18n/translate";
import AuthPage from "@/components/auth-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getSavedLocale();
  return {
    title: translate(locale, "Daftar | SAP"),
    description: translate(locale, "Buat akun Sustainable AI Platform untuk mengenali sampah dan memantau area."),
  };
}

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
