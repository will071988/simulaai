import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Minha conta | SimulaAí",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ContaLayout({ children }: { children: ReactNode }) {
  return children;
}
