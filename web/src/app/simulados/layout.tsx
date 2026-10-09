import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Simulados para concursos públicos | SimulaAí",
  description: "Treine com simulados cronometrados por concurso e banca, acompanhe seu desempenho e revise seus pontos fracos.",
  alternates: { canonical: "/simulados" },
};

export default function SimuladosLayout({ children }: { children: ReactNode }) {
  return children;
}
