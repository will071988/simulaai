/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { QuizProgress } from "@/components/QuizProgress";
import { QuizRecommendationCard } from "@/components/QuizRecommendationCard";
import { perguntas, calculateQuizResult, perfilLabel, analyticsTrack } from "@/lib/quiz";

type Step = "intro" | "questions" | "result";

export default function QuizClient() {
  const [step, setStep] = useState<Step>("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const existing = localStorage.getItem("simulaai_quiz_session");
    if (existing) return existing;
    const sid = crypto.randomUUID();
    localStorage.setItem("simulaai_quiz_session", sid);
    return sid;
  });
  useEffect(() => {
    const saved = localStorage.getItem("simulaai_quiz_answers");
    const savedStep = localStorage.getItem("simulaai_quiz_step") as Step | null;
    const savedIdx = localStorage.getItem("simulaai_quiz_idx");
    if (saved) try { setAnswers(JSON.parse(saved)); } catch {}
    if (savedStep && ["intro","questions","result"].includes(savedStep)) setStep(savedStep);
    if (savedIdx) setIdx(parseInt(savedIdx, 10) || 0);
  }, []);

  useEffect(() => {
    localStorage.setItem("simulaai_quiz_answers", JSON.stringify(answers));
  }, [answers]);
  useEffect(() => { localStorage.setItem("simulaai_quiz_step", step); }, [step]);
  useEffect(() => { localStorage.setItem("simulaai_quiz_idx", String(idx)); }, [idx]);

  const currentQ = perguntas[idx];
  const chosen = answers[currentQ?.id];

  const startQuiz = () => {
    analyticsTrack("quiz_started", { sessionId });
    // fire and forget server
    fetch("/api/quiz/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, started_at: new Date().toISOString() }) }).catch(()=>{});
    setStep("questions");
    setIdx(0);
  };

  const selectOption = (optId: string) => {
    const next = { ...answers, [currentQ.id]: optId };
    setAnswers(next);
    // auto advance after 300ms for fluid
    setTimeout(() => {
      if (idx < perguntas.length - 1) setIdx((v) => v + 1);
      else {
        // finished
        const result = calculateQuizResult(next);
        analyticsTrack("quiz_completed", { sessionId, primaryPerfil: result.primaryPerfil, primaryConcurso: result.primaryConcurso.slug, secondaryConcurso: result.secondaryConcurso.slug });
        fetch("/api/quiz/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            answers: next,
            primary_profile: result.primaryPerfil,
            primary_concurso_slug: result.primaryConcurso.slug,
            primary_score: result.primaryConcurso.compat,
            secondary_concurso_slug: result.secondaryConcurso.slug,
            secondary_score: result.secondaryConcurso.compat,
            completed_at: new Date().toISOString(),
          }),
        }).catch(()=>{});
        setStep("result");
      }
    }, 280);
  };

  const goBack = () => {
    if (idx > 0) setIdx((v) => v - 1);
    else setStep("intro");
  };

  const shareResult = async (result: ReturnType<typeof calculateQuizResult>) => {
    const text = `Meu perfil no SimulaAí combina com ${result.primaryConcurso.nome} (${result.primaryConcurso.compat}% de compatibilidade) — ${perfilLabel[result.primaryPerfil]}. Descubra o seu: https://simulaai-kappa.vercel.app/quiz`;
    if (navigator.share) {
      try { await navigator.share({ title: "SimulaAí — meu concurso", text, url: "https://simulaai-kappa.vercel.app/quiz" }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); alert("Resultado copiado!"); } catch { alert(text); }
    }
  };

  if (step === "intro") {
    return (
      <div className="mesh min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <div className="glass rounded-[28px] p-8 sm:p-10 text-center">
            <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-white text-black font-bold">QUIZ • 8 perguntas • &lt;2 min</span>
            <h1 className="mt-4 font-display font-bold text-3xl sm:text-4xl">Ainda não sabe qual concurso escolher?</h1>
            <p className="mt-3 text-white/70">Descubra quais carreiras mais combinam com seu perfil, rotina e objetivos.</p>
            <p className="mt-2 text-sm text-white/50">Leva menos de 2 minutos. 8 perguntas rápidas.</p>
            <button onClick={startQuiz} className="mt-6 w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black font-bold hover:bg-zinc-100 transition glow-cyan">Descobrir meu concurso →</button>
            <p className="mt-3 text-xs text-white/40">Anônimo • sem cadastro • resultado na hora</p>
            <Link href="/" className="mt-6 inline-block text-sm text-white/60 hover:text-white underline">Voltar para início</Link>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="glass rounded-2xl p-4"><div className="font-bold">6</div><div className="text-white/60">trilhas</div></div>
            <div className="glass rounded-2xl p-4"><div className="font-bold">6</div><div className="text-white/60">perfis</div></div>
            <div className="glass rounded-2xl p-4"><div className="font-bold">2</div><div className="text-white/60">recomendações</div></div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (step === "questions" && currentQ) {
    return (
      <div className="mesh min-h-screen">
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <QuizProgress current={idx + 1} total={perguntas.length} />
          <div className="mt-6 glass rounded-[28px] p-6 sm:p-8">
            <p className="text-xs font-bold tracking-widest text-white/50">PERGUNTA {idx + 1} DE {perguntas.length}</p>
            <h2 className="mt-2 font-display font-bold text-2xl leading-tight">{currentQ.titulo}</h2>
            <div className="mt-6 space-y-3">
              {currentQ.opcoes.map((opt) => {
                const selected = chosen === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => selectOption(opt.id)}
                    className={`w-full text-left rounded-2xl border-2 p-4 flex items-center justify-between transition ${selected ? "border-violet-600 bg-white text-zinc-900" : "border-white/10 bg-white/5 hover:bg-white/10 text-white"}`}
                  >
                    <span className="font-medium pr-4">{opt.label}</span>
                    <span className={`h-6 w-6 rounded-full border-2 grid place-items-center shrink-0 ${selected ? "border-violet-600 bg-violet-600 text-white" : "border-white/20"}`}>{selected ? "✓" : ""}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={goBack} className="rounded-full glass px-6 py-3 text-sm font-medium">← Voltar</button>
              <span className="text-xs text-white/40 self-center">{chosen ? "Avançando..." : "Selecione uma opção"}</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // result
  const result = calculateQuizResult(answers);
  return (
    <div className="mesh min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-white text-black text-xs font-bold">RESULTADO</span>
          <h1 className="mt-3 font-display font-bold text-3xl">Seu perfil combina com:</h1>
          <p className="mt-2 text-xl font-display font-bold bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">{perfilLabel[result.primaryPerfil]}</p>
          <p className="mt-2 text-sm text-white/60 max-w-xl mx-auto">Compatibilidade baseada nas suas respostas. Não é probabilidade de aprovação — é afinidade de perfil.</p>
        </div>

        <div className="mt-6">
          <QuizRecommendationCard
            title="RESULTADO PRINCIPAL"
            nome={result.primaryConcurso.nome}
            banca={result.primaryConcurso.banca}
            nivel={result.primaryConcurso.nivel}
            cor={result.primaryConcurso.cor}
            compat={result.primaryConcurso.compat}
            motivos={result.motivos}
            aviso={result.escolaridadeAviso}
            slug={result.primaryConcurso.slug}
            primary
          />
          <div className="mt-2 text-center text-xs text-white/50">{result.primaryConcurso.compat}% de compatibilidade com seu perfil</div>
        </div>

        <div className="mt-6">
          <p className="text-center text-sm font-bold tracking-widest text-white/60">TAMBÉM COMBINA COM VOCÊ</p>
          <div className="mt-3">
            <QuizRecommendationCard
              title="SEGUNDA OPÇÃO"
              nome={result.secondaryConcurso.nome}
              banca={result.secondaryConcurso.banca}
              nivel={result.secondaryConcurso.nivel}
              cor={result.secondaryConcurso.cor}
              compat={result.secondaryConcurso.compat}
              slug={result.secondaryConcurso.slug}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => {
              localStorage.removeItem("simulaai_quiz_answers");
              localStorage.removeItem("simulaai_quiz_step");
              localStorage.removeItem("simulaai_quiz_idx");
              setAnswers({});
              setIdx(0);
              setStep("intro");
            }}
            className="rounded-full glass px-6 py-3 text-sm font-medium"
          >
            Refazer quiz
          </button>
          <button onClick={() => shareResult(result)} className="rounded-full bg-white text-black px-6 py-3 text-sm font-bold">Compartilhar resultado →</button>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">Sessão: {sessionId.slice(0,8)}… • salvo anonimante</p>
      </main>
      <Footer />
    </div>
  );
}
