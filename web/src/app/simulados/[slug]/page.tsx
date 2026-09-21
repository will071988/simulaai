"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getSimulado } from "@/lib/mock";

export default function SimuladoSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const simulado = getSimulado(slug);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [tempo, setTempo] = useState(0);
  const [finalizado, setFinalizado] = useState(false);

  useEffect(() => {
    if (finalizado || !simulado) return;
    const id = setInterval(() => setTempo((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [finalizado, simulado]);

  if (!simulado) return <div className="mesh min-h-screen grid place-items-center p-8"><div className="glass rounded-3xl p-8">Simulado não encontrado. <Link href="/simulados" className="underline">Voltar</Link></div></div>;

  const total = simulado.questoes.length;
  const acertos = simulado.questoes.filter((q) => respostas[q.id] === q.gabarito).length;
  const duracaoSeg = simulado.duracaoMin * 60;
  const restante = Math.max(0, duracaoSeg - tempo);
  const progresso = Math.min(100, (Object.keys(respostas).length / total) * 100);

  if (finalizado) {
    const nota = Math.round((acertos/total)*100);
    return (
      <div className="mesh min-h-screen">
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#070A1A]/70 border-b border-white/10">
          <div className="mx-auto max-w-3xl px-6 py-4 flex justify-between items-center">
            <Link href="/simulados" className="glass rounded-full px-4 py-2 text-sm">← Voltar</Link>
            <span className="font-display font-bold">{simulado.titulo}</span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="rounded-[28px] bg-white text-zinc-900 p-6 sm:p-8">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div>
                <h1 className="font-display font-bold text-3xl">Resultado</h1>
                <p className="text-zinc-600">{simulado.titulo} • {simulado.banca}</p>
              </div>
              <div className={`h-24 w-24 rounded-full grid place-items-center text-white font-black text-2xl bg-gradient-to-br ${simulado.cor}`}>{nota}%</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-zinc-50 p-4"><div className="font-black text-xl">{acertos}/{total}</div><div className="text-xs text-zinc-500">acertos</div></div>
              <div className="rounded-2xl bg-zinc-50 p-4"><div className="font-black text-xl">{Math.floor(tempo/60)}m {tempo%60}s</div><div className="text-xs text-zinc-500">tempo</div></div>
              <div className="rounded-2xl bg-zinc-900 text-white p-4"><div className="font-black text-xl">Top {Math.max(5, 100-nota)}%</div><div className="text-xs text-white/60">ranking mock</div></div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400" style={{width: `${nota}%`}} /></div>
          </div>

          {simulado.questoes.map((q, idx) => {
            const acertou = respostas[q.id] === q.gabarito;
            return (
              <div key={q.id} className={`mt-4 rounded-3xl p-5 border ${acertou ? "bg-white border-emerald-200" : "bg-white border-red-200"}`}>
                <p className="text-xs font-bold text-zinc-500">Q{idx+1} • {q.tema} • {q.banca}</p>
                <p className="mt-1 font-medium text-zinc-900">{q.enunciado}</p>
                <p className="mt-2 text-sm">Sua: <b>{respostas[q.id] ?? "—"}</b> • Gab: <b>{q.gabarito}</b> {acertou ? "✅" : "❌"}</p>
                <div className="mt-3 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700 border">
                  <b className="text-violet-600">Correção IA:</b> {acertou ? "Excelente! Mantenha revisão semanal desse tema para fixar." : `Pegadinha clássica da ${q.banca}. Revise ${q.tema} hoje: faça 10 questões desse tema e releia a lei seca.`}
                  {!acertou && <div className="mt-2 text-xs text-zinc-500">🔒 Correção completa + plano de revisão liberado na assinatura R$29,90</div>}
                </div>
              </div>
            );
          })}

          <div className="mt-6 rounded-[28px] bg-gradient-to-br from-violet-600 to-cyan-500 p-[1px]">
            <div className="rounded-[27px] bg-[#0F1233] p-6 text-white">
              <h2 className="font-display font-bold text-xl">Desbloqueie ilimitado por R$29,90</h2>
              <p className="text-sm text-white/70 mt-1">Correção completa, ranking, evolução por tema e novos simulados toda semana.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/#planos" className="rounded-full bg-white text-black px-6 py-3 font-bold">Assinar por Pix →</Link>
                <span className="glass rounded-full px-4 py-3 text-sm">Avulso R$14,90 vira crédito</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mesh min-h-screen">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#070A1A]/80 border-b border-white/10">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/simulados" className="glass rounded-full px-4 py-2 text-sm">← Sair</Link>
          <div className="flex-1 mx-4">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 transition-all" style={{width: `${progresso}%`}} /></div>
            <p className="text-xs text-white/60 mt-1 text-center">{Object.keys(respostas).length}/{total} respondidas</p>
          </div>
          <span className="font-mono text-sm px-4 py-2 rounded-full bg-white text-black font-bold">
            {String(Math.floor(restante/60)).padStart(2,"0")}:{String(restante%60).padStart(2,"0")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="glass rounded-3xl p-6">
          <h1 className="font-display font-bold text-2xl">{simulado.titulo}</h1>
          <p className="text-sm text-white/60">{simulado.banca} • {total} questões • {simulado.duracaoMin} min • cronometrado</p>
        </div>

        {simulado.questoes.map((q, idx) => (
          <div key={q.id} className="mt-4 rounded-3xl bg-white p-6 text-zinc-900">
            <p className="text-xs font-bold tracking-widest text-violet-600">Q{idx+1} • {q.tema}</p>
            <p className="mt-2 font-medium leading-relaxed">{q.enunciado}</p>
            <div className="mt-4 space-y-2">
              {q.alternativas.map((a) => {
                const sel = respostas[q.id]===a.letra;
                return (
                  <label key={a.letra} className={`flex gap-3 rounded-2xl border-2 p-4 cursor-pointer transition ${sel ? "border-violet-600 bg-violet-50" : "border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50"}`}>
                    <input type="radio" name={q.id} value={a.letra} checked={sel} onChange={() => setRespostas(r=>({...r,[q.id]:a.letra}))} className="accent-violet-600 mt-1" />
                    <span><b>{a.letra})</b> {a.texto}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <button onClick={() => setFinalizado(true)} className="mt-6 w-full rounded-full bg-white text-black py-4 font-bold text-lg hover:bg-zinc-100 transition glow-cyan">Finalizar e ver correção IA →</button>
        <p className="mt-3 text-center text-xs text-white/50">Grátis: 2 correções completas. Restante libera ao assinar R$29,90.</p>
      </main>
    </div>
  );
}
