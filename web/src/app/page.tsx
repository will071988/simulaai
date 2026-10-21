import type { Metadata } from "next";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { DeferredHotConcursosMap } from "@/components/DeferredHotConcursosMap";
import { BillingCheckoutButton } from "@/components/BillingCheckoutButton";
import { loadPublishedQuestionPool } from "@/lib/simulados/published-pool";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "SimulaAí — Treino com questões e correção comentada",
  description: "Pratique com questões publicadas, correção no servidor e comentários validados. Acompanhe seu desempenho e consulte fontes oficiais de concursos.",
  alternates: { canonical: "/" },
  openGraph: { title: "SimulaAí — Treine e acompanhe sua evolução", description: "Questões publicadas, resultados reais e comentários validados para organizar seus estudos.", url: "/", type: "website" },
};

export default async function Home() {
  const commercialBillingLive = String(process.env.STRIPE_LIVEMODE || "").toLowerCase() === "true";
  const pool = await loadPublishedQuestionPool(undefined, AbortSignal.timeout(2500)).catch(() => null);
  const disciplines = pool ? [...new Set(pool.questions.map((question) => question.disciplina))].sort((a, b) => a.localeCompare(b, "pt-BR")) : [];
  return <div className="mesh min-h-screen"><Header />
    <main>
      <section className="relative overflow-hidden"><div className="grid-pattern pointer-events-none absolute inset-0" /><div className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <p className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">Beta gratuito · banco de questões em expansão</p>
        <h1 className="font-display mt-6 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">Treine com questões.<br /><span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Acompanhe resultados reais.</span></h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">Monte seu treino, responda no seu ritmo e receba uma nota calculada no servidor. Os comentários são exibidos somente quando passam pela validação de conteúdo.</p>
        <div className="mt-7 flex flex-wrap gap-3"><Link href="/simulados#gerador" className="glow-cyan rounded-full bg-white px-7 py-3.5 font-bold text-black">Começar treino grátis →</Link><Link href="/concursos" className="glass rounded-full px-7 py-3.5 font-semibold">Consultar concursos e editais</Link></div>
        <p className="mt-5 text-sm text-white/60">Entre na sua conta antes de iniciar para salvar os resultados no histórico.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">{[[pool ? String(pool.questions.length) : "—", "questões publicadas disponíveis"], [pool ? String(disciplines.length) : "—", "disciplinas com conteúdo"], ["No servidor", "correção do gabarito"]].map(([value, label]) => <div key={label} className="glass rounded-2xl p-5"><p className="font-display text-3xl font-bold">{value}</p><p className="mt-1 text-sm text-white/60">{label}</p></div>)}</div>
      </div></section>
      <section id="trilhas" className="mx-auto max-w-6xl px-6 py-8"><h2 className="font-display text-3xl font-bold">Conteúdo disponível para treinar</h2><p className="mt-2 text-white/65">Escolha uma disciplina do banco publicado. O treino geral reúne conteúdos de fundamentos; não é uma prova oficial de uma banca.</p>
        {disciplines.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{disciplines.slice(0, 6).map((disciplina) => <Link key={disciplina} href={`/simulados?disciplina=${encodeURIComponent(disciplina)}#gerador`} className="glass rounded-3xl p-6 transition hover:bg-white/10"><h3 className="font-display text-xl font-bold">{disciplina}</h3><p className="mt-2 text-sm text-white/65">{pool!.questions.filter((question) => question.disciplina === disciplina).length} questões publicadas</p><span className="mt-5 inline-block font-bold text-cyan-200">Treinar esta disciplina →</span></Link>)}</div> : <p role="status" className="glass mt-6 rounded-3xl p-6 text-white/70">O banco está sendo atualizado. Consulte as opções de treino ou os concursos publicados.</p>}
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-3">{[["1", "Personalize", "Selecione o conteúdo e confira quantas questões estão disponíveis para seus filtros."], ["2", "Responda", "Marque suas respostas e finalize o treino para receber a nota do servidor."], ["3", "Revise", "Consulte gabaritos e comentários validados. Com uma conta, acompanhe seu histórico."]].map(([step, title, text]) => <article key={step} className="glass rounded-3xl p-6"><p className="text-sm font-bold text-cyan-200">PASSO {step}</p><h2 className="font-display mt-3 text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-white/65">{text}</p></article>)}</section>
      <section id="radar" className="mx-auto max-w-6xl px-6 py-8"><div className="glass rounded-[28px] p-6 sm:p-8"><h2 className="font-display text-2xl font-bold">Radar de concursos publicados</h2><p className="mt-2 text-sm text-white/65">Consulte os dados disponíveis e confirme informações no edital oficial. Um concurso pode ainda não ter questões publicadas no banco.</p><div className="mt-6"><DeferredHotConcursosMap /></div><Link href="/concursos" className="mt-5 inline-block text-cyan-200 underline">Ver concursos e fontes oficiais</Link></div></section>
      <section id="planos" className="mx-auto max-w-6xl px-6 py-10"><h2 className="font-display text-center text-3xl font-bold">Comece pelo beta gratuito</h2><p className="mt-3 text-center text-white/65">Os planos pagos permanecem em homologação até a conclusão dos gates de lançamento.</p><div className="mt-7 grid gap-4 md:grid-cols-3">
        <article className="glass rounded-3xl p-6"><h3 className="text-xl font-bold">Treino gratuito</h3><p className="mt-3 text-3xl font-black">R$0</p><p className="mt-3 text-sm text-white/65">Banco publicado, nota no servidor e comentários validados quando disponíveis. O catálogo mostra os limites reais de conteúdo.</p><Link href="/simulados" className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-bold text-black">Treinar agora</Link></article>
        <article className="glass rounded-3xl p-6"><h3 className="text-xl font-bold">Assinatura</h3><p className="mt-3 text-3xl font-black">R$29,90<span className="text-base font-normal">/mês</span></p><p className="mt-2 text-sm text-white/65">Opção anual de R$299. Recursos e condições serão apresentados antes da contratação.</p>{commercialBillingLive ? <div className="mt-5 grid gap-3"><BillingCheckoutButton planCode="premium_monthly" className="w-full rounded-full bg-white py-3 font-bold text-black">Assinar mensal</BillingCheckoutButton><BillingCheckoutButton planCode="premium_annual" className="w-full rounded-full border border-white/30 py-3 font-bold">Assinar anual</BillingCheckoutButton></div> : <p className="mt-5 text-sm text-amber-200">Assinaturas em homologação.</p>}</article>
        <article className="glass rounded-3xl p-6"><h3 className="text-xl font-bold">Avulso</h3><p className="mt-3 text-3xl font-black">R$14,90</p><p className="mt-3 text-sm text-white/65">A oferta e o conteúdo incluído serão detalhados antes da compra.</p>{commercialBillingLive ? <BillingCheckoutButton planCode="premium_one_time" className="mt-5 w-full rounded-full bg-white py-3 font-bold text-black">Comprar por R$14,90</BillingCheckoutButton> : <p className="mt-5 text-sm text-amber-200">Compra avulsa em homologação.</p>}</article>
      </div></section>
    </main><Footer /></div>;
}
