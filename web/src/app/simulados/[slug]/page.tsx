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

  if (!simulado) return <div className="p-8">Simulado não encontrado. <Link href="/simulados" className="underline">Voltar</Link></div>;

  const total = simulado.questoes.length;
  const acertos = simulado.questoes.filter((q) => respostas[q.id] === q.gabarito).length;
  const duracaoSeg = simulado.duracaoMin * 60;
  const restante = Math.max(0, duracaoSeg - tempo);

  if (finalizado) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <header className="border-b bg-white"><div className="mx-auto max-w-3xl px-6 py-4"><Link href="/simulados" className="font-bold">← Voltar</Link></div></header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="text-3xl font-bold">Resultado — {simulado.titulo}</h1>
          <p className="mt-2 text-lg">Nota: <span className="font-bold">{acertos}/{total}</span> • Tempo: {Math.floor(tempo/60)}m {tempo%60}s</p>
          {simulado.questoes.map((q) => {
            const acertou = respostas[q.id] === q.gabarito;
            return (
              <div key={q.id} className={`mt-6 rounded-2xl border p-5 bg-white ${acertou ? "border-green-200" : "border-red-200"}`}>
                <p className="font-medium">{q.enunciado}</p>
                <p className="mt-2 text-sm">Sua resposta: <b>{respostas[q.id] ?? "—"}</b> • Gabarito: <b>{q.gabarito}</b> {acertou ? "✅" : "❌"}</p>
                <p className="mt-2 text-sm text-zinc-600">Tema: {q.tema} • Banca: {q.banca}</p>
                <div className="mt-3 rounded bg-zinc-50 p-3 text-sm">
                  <b>Correção IA (mock):</b> {acertou ? "Mandou bem! Mantenha revisão desse tema." : `Pegadinha da ${q.banca}: revise ${q.tema}. Dica: refaça 10 questões desse tema amanhã.`}
                  {!acertou && <div className="mt-2 text-xs text-zinc-500">Paywall real: correção completa liberada na assinatura R$29,90</div>}
                </div>
              </div>
            );
          })}
          <div className="mt-8 rounded-2xl bg-black text-white p-6">
            <h2 className="font-bold">Desbloqueie correção completa + ilimitado</h2>
            <p className="text-sm text-zinc-300">Assinatura R$29,90/mês ou R$299/ano. Simulado avulso R$14,90.</p>
            <button className="mt-4 rounded-full bg-white text-black px-6 py-2 font-medium">Assinar agora</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 border-b bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link href="/simulados" className="font-bold">SimulaAí</Link>
          <span className="font-mono text-sm bg-zinc-900 text-white px-3 py-1 rounded-full">
            {String(Math.floor(restante/60)).padStart(2,"0")}:{String(restante%60).padStart(2,"0")} restantes
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold">{simulado.titulo}</h1>
        <p className="text-sm text-zinc-600">{simulado.banca} • {total} questões • {simulado.duracaoMin} min</p>

        {simulado.questoes.map((q, idx) => (
          <div key={q.id} className="mt-6 rounded-2xl border bg-white p-5">
            <p className="text-xs font-bold text-zinc-500">Q{idx+1} • {q.tema}</p>
            <p className="mt-2 font-medium">{q.enunciado}</p>
            <div className="mt-4 space-y-2">
              {q.alternativas.map((a) => (
                <label key={a.letra} className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${respostas[q.id]===a.letra ? "border-black bg-zinc-50" : "hover:bg-zinc-50"}`}>
                  <input type="radio" name={q.id} value={a.letra} checked={respostas[q.id]===a.letra} onChange={() => setRespostas((r)=>({ ...r, [q.id]: a.letra }))} />
                  <span><b>{a.letra})</b> {a.texto}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setFinalizado(true)} className="mt-8 w-full rounded-full bg-black text-white py-3 font-medium">Finalizar e ver correção IA</button>
        <p className="mt-2 text-center text-xs text-zinc-500">Grátis: 2 correções completas. Restante no paywall.</p>
      </main>
    </div>
  );
}
