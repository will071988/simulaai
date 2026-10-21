import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { SimuladoGenerator } from "@/components/SimuladoGenerator";

export default async function SimuladosPage({ searchParams }: { searchParams: Promise<{ concursoId?: string | string[]; disciplina?: string | string[]; origem?: string | string[] }> }) {
  const params = await searchParams;
  const requestedContestId = typeof params.concursoId === "string" ? params.concursoId : undefined;
  const initialDiscipline = typeof params.disciplina === "string" && params.disciplina.length <= 120 ? params.disciplina : undefined;
  return <div className="mesh min-h-screen"><Header /><main className="mx-auto max-w-6xl px-6 py-8">
    <h1 className="font-display text-4xl font-bold">Treine com questões publicadas</h1>
    <p className="mt-3 max-w-3xl text-white/70">Personalize o banco geral ou selecione um concurso com conteúdo disponível. Responda às questões, receba a nota do servidor e consulte os comentários validados.</p>
    {params.origem === "trilha-anterior" && <p role="status" className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">Este link agora leva ao treino com o banco publicado. As opções abaixo mostram o conteúdo realmente disponível.</p>}
    <SimuladoGenerator key={`${requestedContestId || "general"}:${initialDiscipline || "all"}`} requestedContestId={requestedContestId} initialDiscipline={initialDiscipline} />
    <section className="mt-8 grid gap-4 md:grid-cols-2">
      <article className="glass rounded-3xl p-6"><h2 className="font-display text-xl font-bold">Seu histórico de estudo</h2><p className="mt-2 text-sm text-white/65">Entre antes de iniciar o treino para vincular a tentativa à sua conta e acompanhar os próximos resultados.</p><Link href="/dashboard" className="mt-4 inline-block text-cyan-200 underline">Acompanhar meu desempenho</Link></article>
      <article className="glass rounded-3xl p-6"><h2 className="font-display text-xl font-bold">Concursos e fontes oficiais</h2><p className="mt-2 text-sm text-white/65">Consulte os editais e os dados publicados. Questões de fundamentos não representam provas oficiais nem certificam o conteúdo de um edital.</p><Link href="/concursos" className="mt-4 inline-block text-cyan-200 underline">Consultar concursos</Link></article>
    </section>
  </main><Footer /></div>;
}
