import { trilhas } from "./mock";

export type Perfil = "SEGURANCA" | "ADMINISTRATIVO" | "FINANCEIRO" | "ATENDIMENTO_SOCIAL" | "TECNICO_OPERACIONAL" | "TECNOLOGIA";

export const perfilLabel: Record<Perfil, string> = {
  SEGURANCA: "Segurança Pública",
  ADMINISTRATIVO: "Gestão e Administração",
  FINANCEIRO: "Análise e Mercado Financeiro",
  ATENDIMENTO_SOCIAL: "Atendimento e Serviço Social",
  TECNICO_OPERACIONAL: "Operações e Infraestrutura",
  TECNOLOGIA: "Tecnologia",
};

export type QuizOption = {
  id: string;
  label: string;
  weights: Partial<Record<Perfil, number>>;
};

export type QuizQuestion = {
  id: string;
  titulo: string;
  opcoes: QuizOption[];
};

export const perguntas: QuizQuestion[] = [
  {
    id: "q1",
    titulo: "Qual sua escolaridade atual?",
    opcoes: [
      { id: "q1_medio", label: "Ensino médio", weights: { TECNICO_OPERACIONAL: 1, ATENDIMENTO_SOCIAL: 1 } },
      { id: "q1_sup_andamento", label: "Superior em andamento", weights: { ADMINISTRATIVO: 1, TECNOLOGIA: 1 } },
      { id: "q1_sup_completo", label: "Superior completo", weights: { FINANCEIRO: 1, SEGURANCA: 1, ADMINISTRATIVO: 1 } },
      { id: "q1_pos", label: "Pós-graduação", weights: { FINANCEIRO: 2, ADMINISTRATIVO: 1 } },
    ],
  },
  {
    id: "q2",
    titulo: "Qual tipo de ambiente de trabalho combina mais com você?",
    opcoes: [
      { id: "q2_externo", label: "Trabalho externo e dinâmico", weights: { SEGURANCA: 3, TECNICO_OPERACIONAL: 1 } },
      { id: "q2_escritorio", label: "Escritório e análise", weights: { FINANCEIRO: 3, ADMINISTRATIVO: 2 } },
      { id: "q2_atendimento", label: "Atendimento a pessoas", weights: { ATENDIMENTO_SOCIAL: 3, ADMINISTRATIVO: 1 } },
      { id: "q2_tecnico", label: "Ambiente técnico ou operacional", weights: { TECNICO_OPERACIONAL: 3, TECNOLOGIA: 2 } },
    ],
  },
  {
    id: "q3",
    titulo: "Qual dessas atividades mais chama sua atenção?",
    opcoes: [
      { id: "q3_investigacao", label: "Investigação e segurança", weights: { SEGURANCA: 3, TECNICO_OPERACIONAL: 1 } },
      { id: "q3_transito", label: "Trânsito e fiscalização", weights: { SEGURANCA: 2, TECNICO_OPERACIONAL: 2 } },
      { id: "q3_financeira", label: "Análise financeira e econômica", weights: { FINANCEIRO: 3, ADMINISTRATIVO: 1 } },
      { id: "q3_atendimento", label: "Atendimento e administração", weights: { ATENDIMENTO_SOCIAL: 3, ADMINISTRATIVO: 2 } },
      { id: "q3_operacoes", label: "Operações técnicas e infraestrutura", weights: { TECNICO_OPERACIONAL: 3, TECNOLOGIA: 2 } },
    ],
  },
  {
    id: "q4",
    titulo: "Como você prefere sua rotina?",
    opcoes: [
      { id: "q4_diferente", label: "Cada dia diferente", weights: { SEGURANCA: 3, TECNICO_OPERACIONAL: 1 } },
      { id: "q4_estruturada", label: "Estruturada e previsível", weights: { ATENDIMENTO_SOCIAL: 2, ADMINISTRATIVO: 2, FINANCEIRO: 1 } },
      { id: "q4_mistura", label: "Mistura entre rotina e novos desafios", weights: { ADMINISTRATIVO: 2, SEGURANCA: 1, TECNOLOGIA: 1 } },
      { id: "q4_tecnico", label: "Ambiente técnico com processos definidos", weights: { TECNICO_OPERACIONAL: 2, TECNOLOGIA: 3 } },
    ],
  },
  {
    id: "q5",
    titulo: "Qual matéria ou área você possui mais afinidade?",
    opcoes: [
      { id: "q5_direito", label: "Direito", weights: { SEGURANCA: 2, ADMINISTRATIVO: 1 } },
      { id: "q5_portugues", label: "Português e interpretação", weights: { ATENDIMENTO_SOCIAL: 2, ADMINISTRATIVO: 1 } },
      { id: "q5_matematica", label: "Matemática / economia", weights: { FINANCEIRO: 3, TECNOLOGIA: 1 } },
      { id: "q5_administracao", label: "Administração", weights: { ADMINISTRATIVO: 3, FINANCEIRO: 1 } },
      { id: "q5_tecnologia", label: "Tecnologia", weights: { TECNOLOGIA: 3, TECNICO_OPERACIONAL: 1 } },
      { id: "q5_tecnico", label: "Conhecimentos técnicos", weights: { TECNICO_OPERACIONAL: 3, TECNOLOGIA: 1 } },
    ],
  },
  {
    id: "q6",
    titulo: "Quanto você se identifica com atividade de segurança pública?",
    opcoes: [
      { id: "q6_muito", label: "Muito", weights: { SEGURANCA: 3 } },
      { id: "q6_um_pouco", label: "Um pouco", weights: { SEGURANCA: 1, ADMINISTRATIVO: 1 } },
      { id: "q6_pouco", label: "Pouco", weights: { ADMINISTRATIVO: 1, FINANCEIRO: 1, ATENDIMENTO_SOCIAL: 1 } },
      { id: "q6_nao", label: "Não me identifico", weights: { FINANCEIRO: 1, ATENDIMENTO_SOCIAL: 1, TECNOLOGIA: 1, TECNICO_OPERACIONAL: 1 } },
    ],
  },
  {
    id: "q7",
    titulo: "O que você mais busca em uma carreira pública?",
    opcoes: [
      { id: "q7_salario", label: "Salário", weights: { FINANCEIRO: 2, SEGURANCA: 1 } },
      { id: "q7_estabilidade", label: "Estabilidade", weights: { ATENDIMENTO_SOCIAL: 2, ADMINISTRATIVO: 2 } },
      { id: "q7_proposito", label: "Propósito", weights: { SEGURANCA: 2, ATENDIMENTO_SOCIAL: 2 } },
      { id: "q7_crescimento", label: "Crescimento", weights: { TECNOLOGIA: 2, FINANCEIRO: 1 } },
      { id: "q7_qualidade", label: "Qualidade de vida", weights: { ATENDIMENTO_SOCIAL: 2, TECNICO_OPERACIONAL: 1 } },
    ],
  },
  {
    id: "q8",
    titulo: "Qual frase mais combina com você?",
    opcoes: [
      { id: "q8_acao", label: "Gosto de ação e tomar decisões rápidas", weights: { SEGURANCA: 3 } },
      { id: "q8_analise", label: "Gosto de analisar dados e números", weights: { FINANCEIRO: 3, ADMINISTRATIVO: 1 } },
      { id: "q8_atendimento", label: "Gosto de ajudar e atender pessoas", weights: { ATENDIMENTO_SOCIAL: 3 } },
      { id: "q8_tecnologia", label: "Gosto de tecnologia e inovação", weights: { TECNOLOGIA: 3 } },
      { id: "q8_operacao", label: "Gosto de operação e colocar a mão na massa", weights: { TECNICO_OPERACIONAL: 3 } },
      { id: "q8_investigacao", label: "Gosto de investigar e descobrir a verdade", weights: { SEGURANCA: 2, TECNICO_OPERACIONAL: 1 } },
    ],
  },
];

// Mapeamento concurso -> perfil weights (forte característica)
// Ajustado para desempate PF (investigação) vs PRF (trânsito/fiscalização)
export const concursoPerfilPesos: Record<string, Partial<Record<Perfil, number>>> = {
  "pf-cebraspe-01": { SEGURANCA: 3, ADMINISTRATIVO: 2, TECNOLOGIA: 1 },
  "prf-cebraspe-01": { SEGURANCA: 3, TECNICO_OPERACIONAL: 3 },
  "pcba-aocp-01": { SEGURANCA: 3, ADMINISTRATIVO: 1 },
  "bacen-cesgranrio-01": { FINANCEIRO: 3, ADMINISTRATIVO: 2 },
  "inss-fgv-01": { ATENDIMENTO_SOCIAL: 3, ADMINISTRATIVO: 2 },
  "transpetro-cesgranrio-01": { TECNICO_OPERACIONAL: 3, TECNOLOGIA: 2 },
};

export const concursoNivel: Record<string, string> = {
  "pf-cebraspe-01": "Superior",
  "prf-cebraspe-01": "Superior",
  "pcba-aocp-01": "Superior",
  "bacen-cesgranrio-01": "Superior",
  "inss-fgv-01": "Superior",
  "transpetro-cesgranrio-01": "Médio/Superior",
};

export function escolaridadeToLevel(optId: string): "medio" | "sup_andamento" | "sup_completo" | "pos" {
  if (optId === "q1_medio") return "medio";
  if (optId === "q1_sup_andamento") return "sup_andamento";
  if (optId === "q1_sup_completo") return "sup_completo";
  return "pos";
}

export function precisaSuperior(slug: string): boolean {
  return concursoNivel[slug] === "Superior";
}

export type QuizResult = {
  scores: Record<Perfil, number>;
  primaryPerfil: Perfil;
  secondaryPerfil: Perfil;
  rankingPerfis: { perfil: Perfil; score: number; compat: number }[];
  primaryConcurso: { slug: string; nome: string; banca: string; nivel: string; cor: string; compat: number };
  secondaryConcurso: { slug: string; nome: string; banca: string; nivel: string; cor: string; compat: number };
  motivos: string[];
  escolaridadeAviso: string | null;
};

export function calculateQuizResult(answers: Record<string, string>): QuizResult {
  // answers: { q1: optionId, q2: optionId, ... }
  const perfis: Perfil[] = ["SEGURANCA", "ADMINISTRATIVO", "FINANCEIRO", "ATENDIMENTO_SOCIAL", "TECNICO_OPERACIONAL", "TECNOLOGIA"];
  const scores: Record<Perfil, number> = {
    SEGURANCA: 0,
    ADMINISTRATIVO: 0,
    FINANCEIRO: 0,
    ATENDIMENTO_SOCIAL: 0,
    TECNICO_OPERACIONAL: 0,
    TECNOLOGIA: 0,
  };

  for (const q of perguntas) {
    const chosenId = answers[q.id];
    if (!chosenId) continue;
    const opt = q.opcoes.find((o) => o.id === chosenId);
    if (!opt) continue;
    for (const p of perfis) {
      scores[p] += opt.weights[p] ?? 0;
    }
  }

  // ranking perfis
  const sortedPerfis = perfis
    .map((p) => ({ perfil: p, score: scores[p] }))
    .sort((a, b) => b.score - a.score || a.perfil.localeCompare(b.perfil));

  const maxScore = Math.max(...sortedPerfis.map((s) => s.score), 1);
  const rankingPerfis = sortedPerfis.map((s) => ({
    ...s,
    compat: Math.round((s.score / maxScore) * 100),
  }));

  const primaryPerfil = sortedPerfis[0].perfil;
  const secondaryPerfil = sortedPerfis[1].perfil;

  // compatibilidade por concurso: dot product perfil scores * concurso pesos, + desempate determinístico por ordem alfabética
  const trilhaBySlug = Object.fromEntries(trilhas.map((t) => [t.slug, t]));
  const concursoScores = Object.entries(concursoPerfilPesos)
    .map(([slug, pesos]) => {
      let score = 0;
      for (const p of perfis) {
        score += (scores[p] ?? 0) * (pesos[p] ?? 0);
      }
      // pequeno bônus por q1 escolaridade superior se concurso exige superior? não, escolaridade não entra no score, só aviso
      return { slug, score };
    })
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  // normalizar compat 0-100: maxScoreConcurso -> 86-92 range pra parecer real, min 45
  const maxConcursoScore = Math.max(...concursoScores.map((c) => c.score), 1);
  const minConcursoScore = Math.min(...concursoScores.map((c) => c.score));

  function toCompat(score: number): number {
    if (maxConcursoScore === minConcursoScore) return 78;
    // linear 62-92
    const norm = (score - minConcursoScore) / (maxConcursoScore - minConcursoScore);
    return Math.round(58 + norm * 34); // 58-92
  }

  const primarySlug = concursoScores[0].slug;
  const secondarySlug = concursoScores[1].slug;

  const pTrilha = trilhaBySlug[primarySlug];
  const sTrilha = trilhaBySlug[secondarySlug];

  // motivos baseados em respostas
  const motivos: string[] = [];
  const ans = answers;
  // q2
  if (ans.q2 === "q2_externo") motivos.push("Você demonstrou preferência por ambientes externos e dinâmicos.");
  else if (ans.q2 === "q2_escritorio") motivos.push("Você prefere ambientes de análise e escritório.");
  else if (ans.q2 === "q2_atendimento") motivos.push("Você valoriza o contato direto com pessoas.");
  else if (ans.q2 === "q2_tecnico") motivos.push("Você se identifica com ambientes técnicos e operacionais.");

  // q6
  if (ans.q6 === "q6_muito") motivos.push("Segurança pública teve forte peso nas suas escolhas.");
  else if (ans.q6 === "q6_nao") motivos.push("Você indicou menor afinidade com segurança pública, priorizando outras áreas.");

  // q3 ou q8
  if (ans.q3 === "q3_investigacao" || ans.q8 === "q8_investigacao") motivos.push("Você indicou interesse em investigação e atuação federal.");
  else if (ans.q3 === "q3_financeira" || ans.q5 === "q5_matematica") motivos.push("Sua afinidade com números e economia se destacou.");
  else if (ans.q3 === "q3_atendimento") motivos.push("O perfil de atendimento e administração apareceu com força.");
  else if (ans.q3 === "q3_operacoes" || ans.q8 === "q8_operacao") motivos.push("Operações técnicas e infraestrutura foram pontos fortes no seu perfil.");
  else if (ans.q3 === "q3_transito") motivos.push("Fiscalização e atuação externa chamaram sua atenção.");

  // garantir 3 motivos
  while (motivos.length < 3) {
    if (motivos.length === 1 && ans.q7 === "q7_estabilidade") motivos.push("Estabilidade foi um fator importante para você.");
    else if (motivos.length === 1 && ans.q7 === "q7_salario") motivos.push("Remuneração é um motivador relevante no seu perfil.");
    else motivos.push(`Seu perfil principal é ${perfilLabel[primaryPerfil]}.`);
    if (motivos.length >= 3) break;
    // fallback determinístico
    motivos.push("Suas respostas indicam consistência com carreiras que exigem análise e responsabilidade.");
    break;
  }

  const escolaridade = answers.q1;
  const precisa = precisaSuperior(primarySlug);
  let escolaridadeAviso: string | null = null;
  if (escolaridade === "q1_medio" && precisa) {
    escolaridadeAviso = "Seu perfil combina com este concurso, mas atualmente ele exige nível superior.";
  } else if (escolaridade === "q1_sup_andamento" && precisa) {
    escolaridadeAviso = "Você está no caminho — este concurso exige superior completo, ótimo para planejar.";
  }

  return {
    scores,
    primaryPerfil,
    secondaryPerfil,
    rankingPerfis,
    primaryConcurso: {
      slug: primarySlug,
      nome: pTrilha?.nome ?? primarySlug,
      banca: pTrilha?.banca ?? "",
      nivel: concursoNivel[primarySlug] ?? "",
      cor: pTrilha?.cor ?? "from-violet-600 to-cyan-400",
      compat: toCompat(concursoScores[0].score),
    },
    secondaryConcurso: {
      slug: secondarySlug,
      nome: sTrilha?.nome ?? secondarySlug,
      banca: sTrilha?.banca ?? "",
      nivel: concursoNivel[secondarySlug] ?? "",
      cor: sTrilha?.cor ?? "from-violet-600 to-cyan-400",
      compat: toCompat(concursoScores[1].score),
    },
    motivos: motivos.slice(0, 3),
    escolaridadeAviso,
  };
}

// helpers para analytics
export function analyticsTrack(event: string, props: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    // shim: console + localStorage, sem lib externa
    console.log(`[analytics] ${event}`, props);
    try {
      const arr = JSON.parse(localStorage.getItem("simulaai_analytics") || "[]");
      arr.push({ event, props, ts: new Date().toISOString() });
      localStorage.setItem("simulaai_analytics", JSON.stringify(arr.slice(-50)));
    } catch {}
  }
}
