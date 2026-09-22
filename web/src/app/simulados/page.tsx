import Link from "next/link";
import { simulados } from "@/lib/mock";
import { Header, Footer } from "@/components/Header";

export default function SimuladosPage() {
  return (
    <div className="mesh min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-4xl">Escolha seu simulado</h1>
            <p className="mt-2 text-white/65">Faça 1 grátis por trilha. Cronometrado, com ranking e correção IA.</p>
          </div>
          <span className="glass rounded-full px-4 py-2 text-xs">6 trilhas • coletor 06h • R$29,90</span>
        </div>
        <div className="mt-6 glass rounded-[24px] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">Está em dúvida?</p>
            <p className="text-sm text-white/60">Descubra seu perfil em menos de 2 minutos.</p>
          </div>
          <Link href="/quiz" className="rounded-full bg-white text-black px-6 py-3 font-bold">Descobrir meu concurso →</Link>
        </div>

        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {simulados.map((s) => (
            <Link key={s.slug} href={`/simulados/${s.slug}`} className="group rounded-[24px] p-[1px] bg-gradient-to-br from-white/15 to-white/5 hover:from-white/25 hover:to-white/10 transition">
              <div className="rounded-[23px] bg-[#0F1233] p-6 h-full">
                <div className={`h-1 w-full rounded-full bg-gradient-to-r ${s.cor} opacity-80`} />
                <span className={`mt-4 inline-block text-xs font-black px-3 py-1 rounded-full bg-gradient-to-r ${s.cor} text-white`}>{s.banca} • {s.orgao} • {s.nivel}</span>
                <h2 className="mt-3 font-display font-semibold text-lg leading-tight">{s.titulo}</h2>
                <p className="text-sm text-white/60 mt-1">{s.questoes.length} questões • {s.duracaoMin} min • {s.vagas}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
                  <span className="px-2 py-1 rounded-full glass">Crono</span>
                  <span className="px-2 py-1 rounded-full glass">Ranking</span>
                  <span className="px-2 py-1 rounded-full glass">IA</span>
                </div>
                <span className="mt-5 inline-flex w-full justify-center rounded-full bg-white text-black py-2.5 text-sm font-bold group-hover:bg-zinc-100">Fazer agora — grátis →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 glass rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold">Não achou sua prova?</h3>
            <p className="text-sm text-white/60">Coletor cria simulado novo todo dia 06h no estilo da banca.</p>
          </div>
          <Link href="/api/collector" className="rounded-full bg-white text-black px-6 py-3 font-semibold">Ver radar ao vivo</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
