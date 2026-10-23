import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QuestionDraftSchema } from "./quality";
import { validateTrustedExplanation } from "../explanations/quality";
import { publishVerifiedBank, type VerifiedQuestion } from "./publish-starter";

export const MACAE_PRACTICE_REVISION = "macae-2024-matematica-v1";
export const MACAE_CONTEST_ID = "b195e9cd-aa71-4c94-99e0-641ab244a608";
export const MACAE_PROGRAMME_URL = "https://conhecimento.fgv.br/sites/default/files/concursos/1-prefeitura-de-macae-diversos-cargos-rsadsjcnos.pdf";
export const MACAE_PROGRAMME_PAGE = "https://conhecimento.fgv.br/concursos/prefeiturademacae24/1";
export const MACAE_PROGRAMME_SCOPE = "Edital 01/2024, Anexo I, Professor C – Matemática, páginas 42–43: aritmética, proporcionalidade, matemática financeira, estatística e probabilidade. Treino temático; não reproduz a prova nem cobre todo o edital.";
type Proof = { kind: "increase" | "discount" | "mean" | "workers" | "probability"; a: number; b: number; c: number };
export type MacaeQuestion = VerifiedQuestion & { proof: Proof; values: number[]; unit: string };
const format = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
const fingerprint = (item: VerifiedQuestion["question"]) => createHash("md5").update(`${item.disciplina}|${item.assunto}|${item.enunciado}`.replace(/\s+/g, " ").toLowerCase()).digest("hex");
function proves(proof: Proof, answer: number) {
  if (proof.kind === "increase") return answer * 100 === proof.a * (100 + proof.b);
  if (proof.kind === "discount") return answer * 100 === proof.a * (100 - proof.b);
  if (proof.kind === "mean") return answer * 3 === proof.a + proof.b + proof.c;
  if (proof.kind === "workers") return answer * proof.b === proof.a * proof.c;
  return answer * 100 === proof.a * proof.b;
}
export function verifyMacaeQuestion(item: MacaeQuestion) {
  const q = QuestionDraftSchema.parse(item.question);
  if (q.concursoId !== MACAE_CONTEST_ID || q.cargo !== "Professor C – Matemática" || q.banca !== null || q.origem !== "QUESTAO_IA" || q.sourceType !== "AI_GENERATED" || q.sourceUrl !== MACAE_PROGRAMME_URL || q.ano !== 2024 || fingerprint(q) !== item.fingerprint) throw new Error("MACAE_PROVENANCE_MISMATCH");
  if (q.alternativas.length !== item.values.length || q.explicacao !== item.explanation.explanation) throw new Error("MACAE_EXPLANATION_MISMATCH");
  const correct = item.values.map((value, index) => proves(item.proof, value) ? index : -1).filter((index) => index >= 0);
  if (correct.length !== 1 || q.alternativas[correct[0]].key !== q.respostaCorreta) throw new Error("MACAE_PROOF_FAILED");
  for (let index = 0; index < item.values.length; index++) if (q.alternativas[index].text !== `${format(item.values[index])}${item.unit}`) throw new Error("MACAE_ALTERNATIVE_MISMATCH");
  validateTrustedExplanation({ id: item.fingerprint, fingerprint: item.fingerprint, statement: q.enunciado, alternatives: q.alternativas, correctAnswer: q.respostaCorreta, discipline: q.disciplina, subject: q.assunto }, item.explanation);
}
export function macaePracticeBank(): MacaeQuestion[] {
  const bank: MacaeQuestion[] = [];
  function add(proof: Proof, subject: string, statement: string, answer: number, distractors: number[], explanation: string, reference: string, unit: string) {
    const numbers = [answer, ...distractors]; const offset = bank.length % numbers.length;
    const values = [...numbers.slice(offset), ...numbers.slice(0, offset)];
    const alternatives = values.map((value, index) => ({ key: String.fromCharCode(65 + index), text: `${format(value)}${unit}`, isCorrect: value === answer }));
    const correctAnswer = alternatives.find((option) => option.isCorrect)!.key;
    const question = QuestionDraftSchema.parse({ concursoId: MACAE_CONTEST_ID, disciplina: "Matemática", assunto: subject, subassunto: "Treino temático autoral — edital Macaé 01/2024", enunciado: statement, alternativas: alternatives, respostaCorreta: correctAnswer, explicacao: explanation, dificuldade: "MEDIO", origem: "QUESTAO_IA", banca: null, ano: 2024, cargo: "Professor C – Matemática", sourceUrl: MACAE_PROGRAMME_URL, sourceType: "AI_GENERATED" });
    const item: MacaeQuestion = { question, fingerprint: fingerprint(question), proof, values, unit, explanation: { correctAnswer, explanation, wrongAlternatives: Object.fromEntries(alternatives.filter((option) => !option.isCorrect).map((option) => [option.key, `O resultado ${option.text} não satisfaz a relação indicada. ${explanation}`])), conceptualReference: `${reference}. Tema previsto no Anexo I do edital Macaé 01/2024, Professor C – Matemática, páginas 42–43. Questão inédita de treino, sem autoria da FGV.`, confidence: 1, explanationQuality: 1 } };
    verifyMacaeQuestion(item); bank.push(item);
  }
  for (let i = 0; i < 6; i++) {
    const base = 500 + i * 100, percent = 10 + i * 5, answer = base * (100 + percent) / 100;
    add({ kind: "increase", a: base, b: percent, c: 0 }, "Matemática financeira: acréscimos", `Uma escola reservou ${base} reais para comprar materiais de geometria. Após um reajuste de ${percent}% nesse orçamento, qual é o valor disponível?`, answer, [base + percent, base * percent / 100, base * (100 - percent) / 100], `O reajuste vale ${base} × ${percent}/100 = ${format(base * percent / 100)} reais. O orçamento final é ${base} + ${format(base * percent / 100)} = ${format(answer)} reais.`, "Porcentagem e fator de acréscimo", " reais");
  }
  for (let i = 0; i < 6; i++) {
    const base = 600 + i * 100, percent = 10 + i * 5, answer = base * (100 - percent) / 100;
    add({ kind: "discount", a: base, b: percent, c: 0 }, "Matemática financeira: descontos", `Um conjunto de recursos didáticos tem preço de ${base} reais. A escola recebe desconto de ${percent}% sobre esse preço. Quanto pagará pelo conjunto?`, answer, [base - percent, base * percent / 100, base * (100 + percent) / 100], `O desconto é ${base} × ${percent}/100 = ${format(base * percent / 100)} reais. O pagamento será ${base} − ${format(base * percent / 100)} = ${format(answer)} reais.`, "Porcentagem e fator de desconto", " reais");
  }
  for (let i = 0; i < 6; i++) {
    const middle = 14 + i * 3, a = middle - 4, b = middle - 1, c = middle + 5;
    add({ kind: "mean", a, b, c }, "Estatística: média aritmética", `Em três oficinas de matemática participaram ${a}, ${b} e ${c} estudantes. Qual foi a média de participantes por oficina, considerando os três encontros com o mesmo peso?`, middle, [a + b + c, (a + b + c) / 2, middle + 1], `A soma é ${a} + ${b} + ${c} = ${a + b + c}. Dividindo pelos três encontros, a média é ${a + b + c}/3 = ${middle} estudantes.`, "Média aritmética simples", " estudantes");
  }
  for (let i = 0; i < 6; i++) {
    const workers = 2 + i, next = workers * 2, hours = 10 + i * 2, answer = hours / 2;
    add({ kind: "workers", a: workers, b: next, c: hours }, "Aritmética: proporcionalidade inversa", `${workers} pessoas organizam um acervo escolar em ${hours} horas. Mantendo produtividade individual constante, sem interferências e com trabalho divisível, quanto tempo ${next} pessoas levariam para organizar o mesmo acervo?`, answer, [hours * 2, hours, answer + 1], `O trabalho total é ${workers} × ${hours} = ${workers * hours} pessoas-hora. Para ${next} pessoas, o tempo é ${workers * hours}/${next} = ${answer} horas.`, "Grandezas inversamente proporcionais", " horas");
  }
  for (let i = 0; i < 6; i++) {
    const a = 20 + i * 5, b = 40, answer = a * b / 100;
    add({ kind: "probability", a, b, c: 0 }, "Probabilidade: eventos independentes", `Em uma atividade, um primeiro sorteio tem ${a}% de chance de selecionar uma ficha azul. Um segundo sorteio independente tem ${b}% de chance de selecionar uma ficha quadrada. Qual é a probabilidade de os dois resultados ocorrerem juntos?`, answer, [a + b, (a + b) / 2, Math.abs(a - b)], `Como os sorteios são independentes, multiplicamos as probabilidades: (${a}/100) × (${b}/100) = ${format(a * b / 10000)}. Em porcentagem, o resultado é ${format(answer)}%.`, "Probabilidade da interseção de eventos independentes", "%");
  }
  if (bank.length !== 30 || new Set(bank.map((item) => item.fingerprint)).size !== 30) throw new Error("MACAE_BANK_INVALID");
  return bank;
}
export async function publishMacaePracticeBank(service: SupabaseClient, actorId: string) {
  const contest = await service.from("concursos").select("id,titulo,is_publishable,quality_status,merged_into_id").eq("id", MACAE_CONTEST_ID).limit(1);
  const row = contest.data?.[0];
  if (contest.error || !row?.is_publishable || row.merged_into_id || !["VERIFIED", "PARTIAL"].includes(row.quality_status) || !/Maca[eé]/i.test(row.titulo)) throw new Error("MACAE_PUBLIC_CONTEST_REQUIRED");
  return { ...await publishVerifiedBank(service, actorId, macaePracticeBank(), MACAE_PRACTICE_REVISION, "exact-arithmetic"), concursoId: MACAE_CONTEST_ID, programmeSource: MACAE_PROGRAMME_URL, coverage: MACAE_PROGRAMME_SCOPE };
}
