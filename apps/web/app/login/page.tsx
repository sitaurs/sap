import type { Metadata } from "next";
import AuthPage from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Masuk | SAP",
  description: "Masuk ke Sustainable AI Platform untuk melanjutkan aksi peduli lingkungan.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
