import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400","500","600","700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "SimulaAí — Simulados que te aprovam",
  description: "Simulados no estilo da banca com correção por IA. PF, PRF, INSS, BACEN e mais. R$29,90/mês. Comece grátis e entre no ranking.",
  openGraph: {
    title: "SimulaAí — Simulados que te aprovam",
    description: "Treine no estilo da banca, com correção IA e ranking real.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
