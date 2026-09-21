const trilhas = [
  { sigla: "PF", nome: "Polícia Federal", detalhe: "1.000 vagas previstas • Cebraspe" },
  { sigla: "PRF", nome: "PRF", detalhe: "533 vagas • Policial + Administrativo" },
  { sigla: "INSS", nome: "INSS", detalhe: "1.500 vagas Analista • Alto volume" },
  { sigla: "BACEN", nome: "Banco Central", detalhe: "560 vagas • Analista / Técnico" },
  { sigla: "PC·PM BA", nome: "PC-BA / PM-BA", detalhe: "750 + 2.700 vagas" },
  { sigla: "ADM", nome: "Transpetro / Dataprev", detalhe: "281 + CR • Cesgranrio" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold">SimulaAí</span>
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            R$ 29,90/mês
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-4xl font-bold tracking-tight">
          Simulados no estilo da banca, com correção por IA.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-600">
          Nada de curso longo. Aqui você treina prova real de concursos quentes,
          ganha nota na hora e descobre o que revisar antes do edital sair.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#trilhas"
            className="rounded-full bg-black px-6 py-3 font-medium text-white hover:bg-zinc-800"
          >
            Fazer simulado grátis
          </a>
          <a
            href="#planos"
            className="rounded-full border px-6 py-3 font-medium hover:bg-zinc-100"
          >
            Ver planos até R$ 29,90
          </a>
        </div>

        <section id="trilhas" className="mt-12">
          <h2 className="text-2xl font-semibold">Trilhas quentes — set/2026</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trilhas.map((t) => (
              <div key={t.sigla} className="rounded-2xl border bg-white p-5">
                <span className="inline-block rounded bg-zinc-900 px-2 py-1 text-xs font-bold text-white">
                  {t.sigla}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{t.nome}</h3>
                <p className="text-sm text-zinc-600">{t.detalhe}</p>
                <button className="mt-4 w-full rounded-full border py-2 text-sm font-medium hover:bg-zinc-900 hover:text-white">
                  Iniciar simulado grátis
                </button>
              </div>
            ))}
          </div>
        </section>

        <section id="planos" className="mt-12 rounded-2xl bg-white p-6 border">
          <h2 className="text-2xl font-semibold">Preço acessível de verdade</h2>
          <ul className="mt-4 space-y-2 text-zinc-700">
            <li>• Grátis: 1 simulado por trilha + correção parcial</li>
            <li>• Trilha única: R$ 29,90/mês ilimitado</li>
            <li>• Total anual: R$ 299/ano — todas as trilhas</li>
            <li>• Avulso final: R$ 14,90 com desconto p/ assinatura</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
