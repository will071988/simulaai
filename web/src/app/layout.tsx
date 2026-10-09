import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400","500","600","700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://simulaai-kappa.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.webmanifest",
  applicationName: "SimulaAí",
  appleWebApp: { capable: true, title: "SimulaAí", statusBarStyle: "black-translucent" },
  title: "SimulaAí — Simulados que te aprovam",
  description: "Simulados no estilo da banca com correção por IA. PF, PRF, INSS, BACEN e mais. R$29,90/mês. Comece grátis e entre no ranking.",
  openGraph: {
    title: "SimulaAí — Simulados que te aprovam",
    description: "Treine no estilo da banca, com correção IA e ranking real.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070A1A",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}
