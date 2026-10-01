export const CONTEST_STATUSES = [
  "PREVISTO", "AUTORIZADO", "COMISSAO_FORMADA", "BANCA_DEFINIDA", "EDITAL_IMEINENTE",
  "EDITAL_ABERTO", "INSCRICOES_ABERTAS", "INSCRICOES_ENCERRADAS", "PROVA_AGENDADA",
  "EM_ANDAMENTO", "RESULTADO", "ENCERRADO",
] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

const order = new Map(CONTEST_STATUSES.map((status, index) => [status, index]));
const aliases: Record<string, ContestStatus> = {
  PREVISTO: "PREVISTO", AUTORIZADO: "AUTORIZADO", "COMISSAO FORMADA": "COMISSAO_FORMADA",
  "BANCA DEFINIDA": "BANCA_DEFINIDA", "EDITAL IMINENTE": "EDITAL_IMEINENTE",
  "EDITAL IMEINENTE": "EDITAL_IMEINENTE", "EDITAL ABERTO": "EDITAL_ABERTO",
  "INSCRICOES ABERTAS": "INSCRICOES_ABERTAS", "INSCRICOES ENCERRADAS": "INSCRICOES_ENCERRADAS",
  "PROVA AGENDADA": "PROVA_AGENDADA", "EM ANDAMENTO": "EM_ANDAMENTO", RESULTADO: "RESULTADO", ENCERRADO: "ENCERRADO",
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeContestStatus(value?: string | null): ContestStatus | null {
  return value ? aliases[fold(value)] || null : null;
}

export function resolveEvidencedContestStatus(input: {
  value?: string | null;
  evidence?: string | null;
  rawText: string;
  sourceTier: number;
}): ContestStatus | null {
  if (input.sourceTier !== 1 || !input.evidence || input.evidence.trim().length < 3) return null;
  if (!fold(input.rawText).includes(fold(input.evidence))) return null;
  return normalizeContestStatus(input.value);
}

export function canTransitionContestStatus(from: ContestStatus | null, to: ContestStatus, input: {
  sourceTier: number;
  hasEvidence: boolean;
  isAmendment?: boolean;
}): boolean {
  if (input.sourceTier !== 1 || !input.hasEvidence) return false;
  if (!from || from === to) return true;
  if (input.isAmendment) return true;
  return (order.get(to) ?? -1) >= (order.get(from) ?? Number.MAX_SAFE_INTEGER);
}
