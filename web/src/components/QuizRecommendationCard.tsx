import Link from "next/link";

export function QuizRecommendationCard({
  title,
  nome,
  banca,
  nivel,
  cor,
  compat,
  motivos,
  aviso,
  slug,
  primary,
}: {
  title: string;
  nome: string;
  banca: string;
  nivel: string;
  cor: string;
  compat: number;
  motivos?: string[];
  aviso?: string | null;
  slug: string;
  primary?: boolean;
}) {
  return (
    <div className={`rounded-[24px] p-[1.5px] ${primary ? "bg-gradient-to-br from-violet-600 to-cyan-400 glow-violet" : "bg-white/10"}`}>
      <div className={`rounded-[22px] p-6 ${primary ? "bg-[#0F1233]" : "bg-white text-zinc-900"}`}>
        <p className={`text-xs font-bold tracking-widest ${primary ? "text-white/60" : "text-zinc-500"}`}>{title}</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-xl">{nome}</h3>
            <p className={`text-sm ${primary ? "text-white/60" : "text-zinc-600"}`}>{banca} • {nivel} • 6 trilhas SimulaAí</p>
          </div>
          <span className={`shrink-0 h-14 w-14 rounded-full grid place-items-center font-black text-white bg-gradient-to-br ${cor}`}>{compat}%</span>
        </div>
        <p className={`text-xs mt-2 ${primary ? "text-white/50" : "text-zinc-500"}`}>{compat}% de compatibilidade com seu perfil</p>
        {motivos && motivos.length > 0 && (
          <ul className={`mt-4 space-y-2 text-sm ${primary ? "text-white/80" : "text-zinc-700"}`}>
            {motivos.map((m, i) => (
              <li key={i} className="flex gap-2"><span className="text-emerald-400">•</span><span>{m}</span></li>
            ))}
          </ul>
        )}
        {aviso && <div className={`mt-4 rounded-2xl p-3 text-xs border ${primary ? "bg-amber-500/10 border-amber-500/20 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"}`}>{aviso}</div>}
        <Link
          href={`/simulados/${slug}?quiz=1`}
          onClick={() => {
            try {
              const sid = localStorage.getItem("simulaai_quiz_session");
              if (sid) fetch("/api/quiz/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sid }) });
            } catch {}
          }}
          className={`mt-5 block text-center rounded-full py-3 font-bold ${primary ? "bg-white text-black hover:bg-zinc-100" : "bg-zinc-900 text-white hover:bg-black"}`}
        >
          {primary ? "Fazer simulado grátis →" : "Ver também →"}
        </Link>
      </div>
    </div>
  );
}
