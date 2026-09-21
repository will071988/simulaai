import Link from "next/link";
import { simulados } from "@/lib/mock";

export default function SimuladosPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex justify-between">
          <Link href="/" className="font-bold text-xl">SimulaAí</Link>
          <span className="text-sm text-zinc-600">6 trilhas quentes</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-bold">Simulados disponíveis</h1>
        <p className="mt-2 text-zinc-600">Escolha a trilha e faça 1 grátis. O resto libera com assinatura R$29,90.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {simulados.map((s) => (
            <Link key={s.slug} href={`/simulados/${s.slug}`} className="rounded-2xl border bg-white p-5 hover:border-black">
              <span className="text-xs font-bold bg-zinc-900 text-white px-2 py-1 rounded">{s.banca} • {s.orgao}</span>
              <h2 className="mt-3 font-semibold text-lg">{s.titulo}</h2>
              <p className="text-sm text-zinc-600">{s.questoes.length} questões • {s.duracaoMin} min • cronometrado</p>
              <span className="mt-4 inline-block rounded-full bg-black text-white px-4 py-2 text-sm">Fazer agora — grátis</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
