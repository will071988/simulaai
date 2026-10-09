import Link from "next/link";
import { Header, Footer } from "@/components/Header";

export default function OfflinePage() {
  return (
    <div className="mesh min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <div className="glass rounded-[32px] p-8 md:p-12">
          <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Sem conexão</p>
          <h1 className="mt-3 font-display text-4xl font-bold">Você está offline</h1>
          <p className="mx-auto mt-4 max-w-xl text-white/65">
            O SimulaAí precisa de internet para carregar concursos, autenticação e dados atualizados. Assim que a conexão voltar, tente novamente.
          </p>
          <Link href="/" className="mt-7 inline-block rounded-full bg-white px-6 py-3 font-bold text-black">Tentar voltar ao início</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
