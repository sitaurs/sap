import type { Metadata } from "next";
import AuthPage from "@/components/auth-page";

export const metadata: Metadata = {
  title: "Daftar | SAP",
  description: "Buat akun Sustainable AI Platform untuk mengenali sampah dan memantau area.",
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
