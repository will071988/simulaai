import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimulaAí — Simulados para concursos",
    short_name: "SimulaAí",
    description: "Simulados para concursos públicos, radar de editais e acompanhamento de desempenho.",
    start_url: "/",
    display: "standalone",
    background_color: "#070A1A",
    theme_color: "#070A1A",
    lang: "pt-BR",
    orientation: "portrait-primary",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
