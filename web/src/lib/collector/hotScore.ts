export type HotScoreInput = {
  status?: string | null;
  vagas?: number | null;
  salario?: number | null;
  prova_data?: string | null;
  tier?: number | null;
  updated_at?: string | null;
};

export function calcHotScore(input: HotScoreInput): number {
  let score = 0;
  const status = (input.status || "").toLowerCase();
  if (status.includes("aberto")) score += 30;
  else if (status.includes("previsto")) score += 15;
  else if (status.includes("autorizado")) score += 20;
  if (status.includes("inscricao") || status.includes("inscri")) score += 25;

  if (input.prova_data) {
    const d = new Date(input.prova_data);
    const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0 && diffDays <= 30) score += 20;
    else if (diffDays > 30 && diffDays <= 90) score += 15;
    else if (diffDays > 90 && diffDays <= 180) score += 5;
  }

  if ((input.vagas || 0) >= 1000) score += 10;
  else if ((input.vagas || 0) >= 300) score += 6;
  else if ((input.vagas || 0) >= 50) score += 3;

  if ((input.salario || 0) >= 15000) score += 10;
  else if ((input.salario || 0) >= 8000) score += 6;

  if (input.tier === 1) score += 5;

  // recente
  if (input.updated_at) {
    const ageDays = (Date.now() - new Date(input.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) score += 5;
  }

  return Math.min(100, Math.max(0, score));
}
