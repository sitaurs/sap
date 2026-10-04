import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
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

export const metadata: Metadata = {
  title: "SAP — Kenali sampah, laporkan lokasi, pahami area",
  description:
    "SAP membantu mengenali jenis sampah, mengirim laporan penumpukan, dan melihat area dengan laporan terverifikasi.",
  openGraph: {
    title: "SAP — Sustainable AI Platform",
    description:
      "Kenali sampah, laporkan penumpukan, dan lihat data area terverifikasi.",
    type: "website",
    locale: "id_ID",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
