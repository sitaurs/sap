import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { LocaleProvider } from "../lib/i18n/provider";
import { getSavedLocale } from "../lib/i18n/server";
import { translate } from "../lib/i18n/translate";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const display = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getSavedLocale();
  const t = (source: string) => translate(locale, source);
  return {
    title: t("SAP — Kenali sampah, laporkan lokasi, pahami area"),
    description: t("SAP membantu mengenali jenis sampah, mengirim laporan penumpukan, dan melihat area dengan laporan terverifikasi."),
    openGraph: {
      title: "SAP — Sustainable AI Platform",
      description: t("Kenali sampah, laporkan penumpukan, dan lihat data area terverifikasi."),
      type: "website",
      locale: locale === "en" ? "en_GB" : "id_ID",
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getSavedLocale();
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
