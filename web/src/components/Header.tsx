import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070A1A]/70 border-b border-white/10">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-400 grid place-items-center font-black text-white glow-violet">S</span>
          <span className="font-display font-bold text-lg tracking-tight">SimulaAí</span>
          <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-white/10 border border-white/15">BETA • até 01/out</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
          <Link href="/quiz" className="hover:text-white">Quiz</Link>
          <Link href="/simulados" className="hover:text-white">Simulados</Link>
          <Link href="/#radar" className="hover:text-white">Radar</Link>
          <Link href="/#planos" className="hover:text-white">Planos</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/simulados" className="hidden sm:inline text-sm px-4 py-2 rounded-full border border-white/15 hover:bg-white hover:text-black transition">Entrar</Link>
          <Link href="/simulados" className="text-sm px-5 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-zinc-100 transition shimmer">Começar grátis</Link>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#070A1A] py-10">
      <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row justify-between gap-4 text-sm text-white/60">
        <span>© 2026 SimulaAí — Simulados com IA. Não somos banca oficial. Fontes: Cebraspe, FGV, AOCP, Cesgranrio.</span>
        <span className="text-white/80">Produção: 01/out/2026 • Coletor diário 06h • R$29,90/mês</span>
      </div>
    </footer>
  );
}
