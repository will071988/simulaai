export type HotScoreInput = {
  status?: string | null;
  vagas?: number | null;
  salario?: number | null;
  prova_data?: string | null;
  tier?: number | null;
  updated_at?: string | null;
  inscricao_inicio?: string | null;
  inscricao_fim?: string | null;
  sourceTier?: number | null;
  retificacao?: boolean;
};

export function calcHotScoreWithReasons(input: HotScoreInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const status = (input.status || "").toLowerCase();
  const now = Date.now();
  const start = input.inscricao_inicio ? Date.parse(input.inscricao_inicio) : NaN;
  const end = input.inscricao_fim ? Date.parse(input.inscricao_fim) : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) { score += 30; reasons.push("Inscricoes abertas"); }
  else if (status.includes("aberto")) { score += 20; reasons.push("Status aberto"); }
  else if (status.includes("previsto")) score += 15;
  else if (status.includes("autorizado")) score += 20;

  if (input.prova_data) {
    const d = new Date(input.prova_data);
    const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0 && diffDays <= 30) { score += 20; reasons.push(`Prova em ${Math.ceil(diffDays)} dias`); }
    else if (diffDays > 30 && diffDays <= 90) { score += 15; reasons.push(`Prova em ${Math.ceil(diffDays)} dias`); }
    else if (diffDays > 90 && diffDays <= 180) score += 5;
  }

  if ((input.vagas || 0) >= 1000) { score += 10; reasons.push(`${input.vagas} vagas`); }
  else if ((input.vagas || 0) >= 300) score += 6;
  else if ((input.vagas || 0) >= 50) score += 3;

  if ((input.salario || 0) >= 15000) { score += 10; reasons.push("Salario acima de R$ 15 mil"); }
  else if ((input.salario || 0) >= 8000) score += 6;

  if (input.tier === 1 || input.sourceTier === 1) { score += 5; reasons.push("Fonte oficial"); }
  if (input.retificacao) { score += 3; reasons.push("Retificacao recente"); }

  // recente
  if (input.updated_at) {
    const ageDays = (Date.now() - new Date(input.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) { score += 5; reasons.push("Atualizado recentemente"); }
  }

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

export function calcHotScore(input: HotScoreInput): number { return calcHotScoreWithReasons(input).score; }
