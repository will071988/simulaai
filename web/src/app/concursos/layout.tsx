import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Concursos públicos, editais e oportunidades | SimulaAí",
  description: "Busque concursos públicos por órgão, banca, cargo, estado, escolaridade, salário e status. Consulte dados com fontes e evidências.",
  alternates: { canonical: "/concursos" },
  openGraph: {
    title: "Concursos públicos, editais e oportunidades | SimulaAí",
    description: "Encontre concursos públicos e consulte dados com fontes e evidências.",
    url: "/concursos",
    type: "website",
  },
};

export default function ConcursosLayout({ children }: { children: ReactNode }) {
  return children;
}
