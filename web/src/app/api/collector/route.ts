import { NextResponse } from "next/server";

// MVP coletor diário — roda via Vercel Cron 06h
// Hoje: mock que simula coleta de editais quentes. Próximo passo: plugar scraper real + Supabase
const FONTES = ["Cebraspe", "FGV", "AOCP", "Cesgranrio", "PCI Concursos", "DOU"];

export async function GET() {
  const concursos = [
    { orgao: "PF", vagas: 1000, banca: "Cebraspe", status: "previsto", fonte: "Cebraspe" },
    { orgao: "PRF", vagas: 533, banca: "Cebraspe", status: "previsto", fonte: "Cebraspe" },
    { orgao: "INSS", vagas: 1500, banca: "A definir", status: "autorizado", fonte: "PCI" },
    { orgao: "BACEN", vagas: 560, banca: "A definir", status: "solicitado", fonte: "DOU" },
  ];

  // TODO: salvar em Supabase.concursos + disparar geração de simulados
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    fontesChecadas: FONTES,
    concursosEncontrados: concursos.length,
    concursos,
    next: "Integrar Supabase + scraper Playwright em collector/",
  });
}
