import { extractionEvidenceQuotes, isLiteralExtractionEvidence } from "./extractionEvidence";

export const CONTEST_STATUSES = [
  "PREVISTO", "AUTORIZADO", "COMISSAO_FORMADA", "BANCA_DEFINIDA", "EDITAL_IMEINENTE",
  "EDITAL_ABERTO", "INSCRICOES_ABERTAS", "INSCRICOES_ENCERRADAS", "PROVA_AGENDADA",
  "EM_ANDAMENTO", "RESULTADO", "ENCERRADO", "CANCELADO",
] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

const order = new Map(CONTEST_STATUSES.map((status, index) => [status, index]));
const aliases: Record<string, ContestStatus> = {
  PREVISTO: "PREVISTO", AUTORIZADO: "AUTORIZADO", "COMISSAO FORMADA": "COMISSAO_FORMADA",
  "BANCA DEFINIDA": "BANCA_DEFINIDA", "EDITAL IMINENTE": "EDITAL_IMEINENTE",
  "EDITAL IMEINENTE": "EDITAL_IMEINENTE", "EDITAL ABERTO": "EDITAL_ABERTO",
  "INSCRICOES ABERTAS": "INSCRICOES_ABERTAS", "INSCRICOES ENCERRADAS": "INSCRICOES_ENCERRADAS",
  "PROVA AGENDADA": "PROVA_AGENDADA", "EM ANDAMENTO": "EM_ANDAMENTO", RESULTADO: "RESULTADO", ENCERRADO: "ENCERRADO",
  CANCELADO: "CANCELADO", CANCELADA: "CANCELADO", CANCELAMENTO: "CANCELADO",
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeContestStatus(value?: string | null): ContestStatus | null {
  return value ? aliases[fold(value)] || null : null;
}

export function findContestStatusEvidence(value: string, text: string): { start: number; end: number } | undefined {
  const status = normalizeContestStatus(value);
  if (!status) return undefined;
  const folded = fold(text).toLowerCase();
  const event = "(?:concurso(?:\\s+publico)?|certame|processo\\s+seletivo)";
  let expression = status === "CANCELADO"
    ? `cancelamento\\s+(?:(?:do|de|deste|desse|da|desta)\\s+)?(?:(?:presente|referido|respectivo)\\s+)?${event}|${event}\\s+(?:(?:esta|foi|fica|sera)\\s+)?cancelad[oa]|cancelad[oa]\\s+(?:(?:o|a|este|esta)\\s+)?(?:(?:presente|referido)\\s+)?${event}|cancelamento\\s+do\\s+edital[^;]{0,180}bem\\s+como\\s+das\\s+inscricoes[^;]{0,100}processo\\s+seletivo`
    : status === "EDITAL_IMEINENTE" ? "\\bedital\\s+(?:iminente|imeinente)\\b" : `\\b${status.toLowerCase().replace(/_/g, "\\s+")}\\b`;
  if (status === "RESULTADO") expression = "\\bresultado\\s+(?:final|definitivo)\\b";
  if (status === "PREVISTO") expression = `\\b${event}\\s+previst[oa]\\s+para\\b`;
  if (status === "ENCERRADO") expression = `\\b${event}\\s+(?:(?:esta|foi|fica)\\s+)?encerrad[oa]\\b|\\bencerramento\\s+(?:do|deste|desse)\\s+${event}\\b`;
  if (status === "AUTORIZADO") expression = `\\bautorizad[oa]\\s+(?:a\\s+realizacao\\s+(?:do|de)|o|a)\\s+${event}\\b|\\b${event}\\s+(?:(?:esta|foi|fica)\\s+)?autorizad[oa]\\b|\\bautoriza\\s+a\\s+realizacao\\s+(?:do|de)\\s+${event}\\b`;
  for (const match of folded.matchAll(new RegExp(expression, "g"))) {
    const prefix = folded.slice(Math.max(0, match.index! - 50), match.index);
    if (/(?:\bnao\s+(?:(?:sera|foi|esta|fica|houve|havera|ha|ocorrera)\s+)?|\bsem\s+(?:o\s+)?|\b(?:possibilidade|hipotese|previsao|risco)\s+de\s+)$/.test(prefix)) continue;
    if (status === "RESULTADO") {
      const suffix = folded.slice(match.index! + match[0].length).split(/[.;]/, 1)[0].slice(0, 100);
      const entireContest = new RegExp(`^\\s+(?:do|deste|desse)\\s+${event}\\b`).test(suffix);
      if (!entireContest && /\b(?:analise|isencao|inscricao|inscricoes|recurso|recursos|atendimento|heteroidentificacao|avaliacao|prova|provas|etapa|fase|solicitacao|solicitacoes)\b/.test(suffix)) continue;
    }
    return { start: match.index!, end: match.index! + match[0].length };
  }
  return undefined;
}

export function resolveEvidencedContestStatus(input: {
  value?: string | null;
  evidence?: string | string[] | null;
  rawText: string;
  sourceTier: number;
}): ContestStatus | null {
  const status = normalizeContestStatus(input.value);
  if (input.sourceTier !== 1 || !status || !isLiteralExtractionEvidence("status", input.evidence, input.rawText, status)) return null;
  return findContestStatusEvidence(status, input.rawText) && extractionEvidenceQuotes(input.evidence).some((quote) => findContestStatusEvidence(status, quote)) ? status : null;
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
