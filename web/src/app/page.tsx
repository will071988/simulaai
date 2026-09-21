import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { trilhas } from "@/lib/mock";

export default function Home() {
  return (
    <div className="mesh min-h-screen">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
        {/* orbs */}
        <div className="absolute -top-20 -right-20 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-violet-600/30 to-cyan-400/30 blur-[80px] pointer-events-none animate-float" />
        <div className="absolute top-40 -left-20 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-pink-500/20 to-orange-400/20 blur-[70px] pointer-events-none animate-float-delayed" />

        <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-10 sm:pt-16">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Coletor IA ativo • 6 editais quentes monitorados diariamente às 06h
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-white text-black font-bold">NOVO</span>
          </div>

          <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
            <div>
              <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[0.95]">
                Simulados que<br />
                <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">te aprovam</span><br />
                no estilo da banca.
              </h1>
              <p className="mt-4 text-lg text-white/70 max-w-xl leading-relaxed">
                Nada de curso arrastado. Treine prova real cronometrada, ganhe correção comentada por IA e descubra exatamente o que revisar antes do edital sair.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/simulados" className="px-7 py-3.5 rounded-full bg-white text-black font-semibold hover:bg-zinc-100 transition glow-cyan">Fazer simulado grátis →</Link>
                <Link href="#planos" className="px-7 py-3.5 rounded-full glass font-medium hover:bg-white/10 transition">Ver planos até R$29,90</Link>
              </div>
              <div className="mt-6 flex items-center gap-6 text-sm">
                <span className="flex -space-x-2"><span className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 border-2 border-[#070A1A]" /><span className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 border-2 border-[#070A1A]" /><span className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 border-2 border-[#070A1A]" /></span>
                <span className="text-white/60">+2.400 concurseiros • 4.8/5 (327 avaliações)</span>
                <span className="hidden sm:inline px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 text-xs">Cronômetro + Ranking</span>
              </div>
            </div>

            {/* mock preview card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600/30 to-cyan-400/30 blur-2xl rounded-[32px]" />
              <div className="relative glass rounded-[28px] p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-widest text-white/60">SIMULADO AO VIVO • PF</span>
                  <span className="text-xs font-mono px-3 py-1 rounded-full bg-white text-black">58:42 restantes</span>
                </div>
                <div className="mt-4 rounded-2xl bg-white text-zinc-900 p-5">
                  <p className="text-xs font-bold text-violet-600">Q3 • RACIOCÍNIO LÓGICO • Cebraspe</p>
                  <p className="mt-2 font-medium leading-snug">“Se P então Q” equivale a “Se não Q então não P”. Julgue:</p>
                  <div className="mt-4 space-y-2">
                    <div className="rounded-xl border-2 border-violet-600 bg-violet-50 p-3 text-sm font-medium">A) Certo ✓</div>
                    <div className="rounded-xl border p-3 text-sm text-zinc-500">B) Errado</div>
                  </div>
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">Correção IA: mandou bem! Equivalência contrapositiva. Próximo: revise tabela-verdade.</div>
                </div>
                <div className="mt-4 flex gap-2 text-xs">
                  <span className="px-3 py-2 rounded-full bg-white text-black font-semibold">65% acertos médio</span>
                  <span className="px-3 py-2 rounded-full glass">Top 12% no ranking</span>
                </div>
              </div>
            </div>
          </div>

          {/* métricas */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["6", "trilhas quentes"],
              ["12k+", "questões no estilo banca"],
              ["06h", "coletor diário IA"],
              ["R$29,90", "plano ilimitado"],
            ].map(([n,l])=>(
              <div key={n} className="glass rounded-2xl p-4 text-center">
                <div className="font-display font-bold text-2xl">{n}</div><div className="text-xs text-white/60">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRILHAS */}
      <section id="trilhas" className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between">
          <h2 className="font-display font-bold text-3xl">Trilhas quentes — set/2026</h2>
          <Link href="/simulados" className="hidden sm:inline text-sm text-white/70 hover:text-white">Ver todos →</Link>
        </div>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trilhas.map(t=>(
            <Link key={t.sigla} href={`/simulados/${t.slug}`} className="group relative overflow-hidden rounded-[24px] p-[1px] bg-gradient-to-br from-white/20 to-white/5 hover:from-white/30 hover:to-white/10 transition">
              <div className="rounded-[23px] bg-[#0F1233] p-5 h-full relative overflow-hidden">
                <div className={`absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${t.cor} opacity-30 blur-2xl group-hover:opacity-40 transition`} />
                <span className={`inline-block rounded-full bg-gradient-to-br ${t.cor} px-3 py-1 text-xs font-black text-white`}>{t.sigla} • {t.banca}</span>
                <h3 className="mt-3 font-semibold text-lg">{t.nome}</h3>
                <p className="text-sm text-white/60">{t.vagas} vagas • {t.banca}</p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-semibold group-hover:gap-3 transition-all">Iniciar grátis →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ["01", "Radar IA 06h", "Monitoramos Cebraspe, FGV, AOCP, Cesgranrio, DOU e criamos simulado no estilo da banca."],
            ["02", "Prova cronometrada", "Faça no tempo real, com ranking, estatísticas e controle de ansiedade."],
            ["03", "Correção que ensina", "IA explica pegadinha da banca, tema fraco e sugere o próximo simulado."],
          ].map(([n,t,d])=>(
            <div key={n} className="glass rounded-3xl p-6">
              <div className="h-10 w-10 rounded-2xl bg-white text-black grid place-items-center font-black">{n}</div>
              <h3 className="mt-4 font-display font-semibold text-lg">{t}</h3>
              <p className="mt-2 text-sm text-white/65 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RADAR */}
      <section id="radar" className="mx-auto max-w-6xl px-6 py-6">
        <div className="rounded-[28px] bg-white text-zinc-900 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display font-bold text-2xl">Radar de editais — coletor diário</h2>
            <span className="text-xs px-3 py-1 rounded-full bg-zinc-900 text-white">Atualiza todo dia 06h • /api/collector</span>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-500"><tr><th className="text-left py-2">Órgão</th><th className="text-left">Vagas</th><th className="text-left">Banca</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {[
                  ["Polícia Federal", "1.000", "Cebraspe", "Previsto"],
                  ["PRF", "533", "Cebraspe", "Previsto"],
                  ["INSS", "1.500", "A definir", "Autorizado"],
                  ["Banco Central", "560", "A definir", "Solicitado"],
                  ["PC-BA", "750", "AOCP", "Aberto até 08/set"],
                  ["Transpetro", "281 + 3.890 CR", "Cesgranrio", "Aberto"],
                ].map(r=>(
                  <tr key={r[0]} className="border-t"><td className="py-3 font-medium">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><span className="px-2 py-1 rounded-full bg-zinc-900 text-white text-xs">{r[3]}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/simulados" className="mt-6 inline-block rounded-full bg-zinc-900 text-white px-6 py-3 font-medium">Gerar simulado do edital →</Link>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="font-display font-bold text-3xl text-center">Um preço jovial, sem pegadinha</h2>
        <p className="text-center text-white/60 mt-2">Até R$30. Cancele quando quiser. Comece grátis.</p>
        <div className="mt-8 grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <div className="glass rounded-[24px] p-6">
            <h3 className="font-bold">Grátis</h3><p className="text-3xl font-black mt-2">R$0</p><p className="text-sm text-white/60">1 simulado por trilha + 2 correções IA</p>
            <ul className="mt-4 text-sm space-y-2 text-white/80"><li>✓ Cronômetro</li><li>✓ Nota na hora</li><li>• Paywall no resto</li></ul>
            <Link href="/simulados" className="mt-6 block text-center rounded-full border border-white/20 py-3 font-medium hover:bg-white hover:text-black transition">Começar grátis</Link>
          </div>
          <div className="relative rounded-[24px] p-[1.5px] bg-gradient-to-br from-violet-600 to-cyan-400 glow-violet">
            <div className="rounded-[22px] bg-[#0F1233] p-6">
              <span className="text-xs font-black tracking-widest px-3 py-1 rounded-full bg-white text-black">MAIS POPULAR</span>
              <h3 className="font-bold mt-3">Trilha Ilimitada</h3><p className="text-3xl font-black mt-2">R$29,90<span className="text-base font-normal text-white/60">/mês</span></p><p className="text-sm text-white/60">ou R$299/ano (2 meses grátis)</p>
              <ul className="mt-4 text-sm space-y-2"><li>✓ Ilimitado na sua trilha</li><li>✓ Correção IA completa</li><li>✓ Ranking + evolução por tema</li><li>✓ Novos simulados toda semana</li></ul>
              <Link href="/simulados" className="mt-6 block text-center rounded-full bg-white text-black py-3 font-bold hover:bg-zinc-100 transition">Assinar por Pix →</Link>
              <p className="text-xs text-center text-white/50 mt-2">Mercado Pago • Stripe em breve</p>
            </div>
          </div>
          <div className="glass rounded-[24px] p-6">
            <h3 className="font-bold">Avulso Final</h3><p className="text-3xl font-black mt-2">R$14,90</p><p className="text-sm text-white/60">Simulado Premium pré-edital</p>
            <ul className="mt-4 text-sm space-y-2 text-white/80"><li>✓ No estilo exato da banca</li><li>✓ Gabarito comentado</li><li>✓ Vira crédito p/ assinatura</li></ul>
            <Link href="/simulados" className="mt-6 block text-center rounded-full bg-white text-black py-3 font-medium">Comprar avulso</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
