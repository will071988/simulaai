import Link from "next/link";
import { Header, Footer } from "@/components/Header";

export default function DashboardPage() {
  return (
    <div className="mesh min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display font-bold text-3xl">Seu painel</h1>
        <p className="text-white/60 mt-1">Evolução por tema, ranking e próximos simulados. Mock pronto pro Supabase.</p>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="glass rounded-3xl p-6"><div className="text-sm text-white/60">Taxa de acerto</div><div className="text-3xl font-black mt-1">68%</div><div className="text-xs text-emerald-300 mt-1">+6% na semana</div></div>
          <div className="glass rounded-3xl p-6"><div className="text-sm text-white/60">Simulados feitos</div><div className="text-3xl font-black mt-1">14</div><div className="text-xs text-white/60">Meta: 4/semana</div></div>
          <div className="rounded-3xl bg-white text-zinc-900 p-6"><div className="text-sm text-zinc-500">Ranking PF</div><div className="text-3xl font-black mt-1">#342</div><div className="text-xs text-zinc-500">Top 18% • suba 50 posições essa semana</div></div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-3xl bg-white p-6 text-zinc-900">
            <h2 className="font-display font-bold">Pontos fracos (IA)</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex justify-between border-b pb-2"><span>Direito Administrativo</span><span className="font-bold text-red-600">52%</span></li>
              <li className="flex justify-between border-b pb-2"><span>Português - FGV</span><span className="font-bold text-amber-600">64%</span></li>
              <li className="flex justify-between"><span>Raciocínio Lógico</span><span className="font-bold text-emerald-600">81%</span></li>
            </ul>
            <Link href="/simulados" className="mt-4 inline-block rounded-full bg-zinc-900 text-white px-5 py-2 text-sm">Próximo simulado recomendado →</Link>
          </div>
          <div className="glass rounded-3xl p-6">
            <h2 className="font-display font-bold">Cronograma até 01/out</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3"><span className="px-2 py-1 rounded-full bg-white text-black text-xs h-fit">22/set</span><span>PF Cebraspe 02 — 60 questões</span></div>
              <div className="flex gap-3"><span className="px-2 py-1 rounded-full glass text-xs h-fit">25/set</span><span>PRF + Legislação seca</span></div>
              <div className="flex gap-3"><span className="px-2 py-1 rounded-full glass text-xs h-fit">28/set</span><span>Simulado final INSS FGV</span></div>
              <div className="flex gap-3"><span className="px-2 py-1 rounded-full bg-emerald-500 text-white text-xs h-fit">01/out</span><span className="font-bold">Lançamento oficial em produção ✅</span></div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
