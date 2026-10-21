import { createHash } from "node:crypto";
import { QuestionDraftSchema, type QuestionDraft } from "./quality";
import { validateTrustedExplanation, type TrustedExplanation } from "../explanations/quality";

export const STARTER_BANK_REVISION = "fundamentos-v1";
type NumberProof = { kind: "increase" | "discount" | "mean" | "workers" | "probability"; numbers: number[] };
type LogicProof = { kind: "logic"; p: boolean; q: boolean; operator: "and" | "or" | "implies" | "equivalent" };
type Proof = NumberProof | LogicProof;
export type StarterQuestion = { question: QuestionDraft; fingerprint: string; explanation: TrustedExplanation; proof: Proof; values: Array<number | boolean>; unit: string };
const format = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
function fingerprint(question: QuestionDraft) { return createHash("md5").update(`${question.disciplina}|${question.assunto}|${question.enunciado}`.replace(/\s+/g, " ").toLowerCase()).digest("hex"); }
function proves(proof: Proof, answer: number | boolean): boolean {
  if (proof.kind === "logic") {
    const truth = { and: [false, false, false, true], or: [false, true, true, true], implies: [true, true, false, true], equivalent: [true, false, false, true] };
    return answer === truth[proof.operator][Number(proof.p) * 2 + Number(proof.q)];
  }
  if (typeof answer !== "number") return false;
  const [a, b, c] = proof.numbers;
  if (proof.kind === "increase") return answer * 100 === a * (100 + b);
  if (proof.kind === "discount") return answer * 100 === a * (100 - b);
  if (proof.kind === "mean") return answer * proof.numbers.length === proof.numbers.reduce((sum, value) => sum + value, 0);
  if (proof.kind === "workers") return answer * b === a * c;
  return answer * 100 === a * b;
}

export function verifyStarterQuestion(item: StarterQuestion): void {
  const question = QuestionDraftSchema.parse(item.question);
  if (question.concursoId !== null || question.banca !== null || question.origem !== "QUESTAO_IA" || question.sourceType !== "AI_GENERATED" || question.explicacao !== item.explanation.explanation || question.alternativas.length !== item.values.length) throw new Error("STARTER_PROVENANCE_MISMATCH");
  if (fingerprint(question) !== item.fingerprint) throw new Error("STARTER_FINGERPRINT_MISMATCH");
  const correct = item.values.map((value, index) => proves(item.proof, value) ? index : -1).filter((index) => index >= 0);
  if (correct.length !== 1 || question.alternativas[correct[0]].key !== question.respostaCorreta) throw new Error("STARTER_PROOF_FAILED");
  for (let index = 0; index < item.values.length; index++) {
    const value = item.values[index];
    const expected = typeof value === "boolean" ? value ? "Verdadeiro" : "Falso" : `${format(value)}${item.unit}`;
    if (question.alternativas[index].text !== expected) throw new Error("STARTER_ALTERNATIVE_MISMATCH");
  }
  validateTrustedExplanation({ id: item.fingerprint, fingerprint: item.fingerprint, statement: question.enunciado, alternatives: question.alternativas, correctAnswer: question.respostaCorreta, discipline: question.disciplina, subject: question.assunto }, item.explanation);
}

export function starterBank(): StarterQuestion[] {
  const bank: StarterQuestion[] = [];
  function add(proof: Proof, subject: string, statement: string, answer: number | boolean, distractors: Array<number | boolean>, explanation: string, reference: string, unit = "", difficulty: "FACIL" | "MEDIO" = "FACIL") {
    const values = [answer, ...distractors];
    const offset = bank.length % values.length;
    const rotated = [...values.slice(offset), ...values.slice(0, offset)];
    const alternativas = rotated.map((value, index) => ({ key: String.fromCharCode(65 + index), text: typeof value === "boolean" ? value ? "Verdadeiro" : "Falso" : `${format(value)}${unit}`, isCorrect: value === answer }));
    const correctAnswer = alternativas.find((alternative) => alternative.isCorrect)!.key;
    const question = QuestionDraftSchema.parse({ concursoId: null, disciplina: proof.kind === "logic" ? "Raciocínio Lógico" : "Matemática", assunto: subject, enunciado: statement, alternativas, respostaCorreta: correctAnswer, explicacao: explanation, dificuldade: difficulty, origem: "QUESTAO_IA", banca: null, ano: null, cargo: "Geral", sourceType: "AI_GENERATED" });
    const item: StarterQuestion = { question, fingerprint: fingerprint(question), proof, values: rotated, unit, explanation: { correctAnswer, explanation, wrongAlternatives: Object.fromEntries(alternativas.filter((alternative) => !alternative.isCorrect).map((alternative) => [alternative.key, `A opção ${alternative.text} não satisfaz a operação pedida. ${explanation}`])), conceptualReference: `${reference}. Gabarito conferido por cálculo exato ou tabela-verdade (${STARTER_BANK_REVISION}).`, confidence: 1, explanationQuality: 1 } };
    verifyStarterQuestion(item); bank.push(item);
  }
  for (const [base, percent] of [[150, 20], [120, 10], [240, 25], [300, 20], [160, 20]]) {
    const answer = base + base * percent / 100;
    add({ kind: "increase", numbers: [base, percent] }, "Porcentagem: acréscimo", `Um material de estudo custa ${base} reais e recebe um acréscimo de ${percent}%. Qual é o novo preço desse material?`, answer, [base + percent, base * percent / 100, base - base * percent / 100], `O acréscimo é ${base} × ${percent}/100 = ${format(base * percent / 100)} reais. Somando ao preço inicial, temos ${base} + ${format(base * percent / 100)} = ${format(answer)} reais.`, "Porcentagem: valor final = valor inicial × (1 + taxa/100)", " reais");
  }
  for (const [base, percent] of [[160, 25], [240, 25], [320, 10], [180, 20], [400, 15]]) {
    const answer = base - base * percent / 100;
    add({ kind: "discount", numbers: [base, percent] }, "Porcentagem: desconto", `Uma inscrição custa ${base} reais e recebe desconto de ${percent}%. Qual é o valor pago após esse desconto?`, answer, [base - percent, base * percent / 100, base + base * percent / 100], `O desconto é ${base} × ${percent}/100 = ${format(base * percent / 100)} reais. Subtraindo do preço inicial: ${base} − ${format(base * percent / 100)} = ${format(answer)} reais.`, "Porcentagem: valor final = valor inicial × (1 − taxa/100)", " reais");
  }
  for (const middle of [30, 50, 70, 90, 110]) {
    const numbers = [middle - 10, middle, middle + 10]; const sum = numbers.reduce((total, value) => total + value, 0);
    add({ kind: "mean", numbers }, "Média aritmética", `Uma pessoa obteve ${numbers.join(", ")} pontos em três avaliações com o mesmo peso. Qual é a média aritmética das três notas?`, middle, [sum, sum / 2, 20], `A média é a soma das notas dividida pela quantidade de avaliações: (${numbers.join(" + ")})/3 = ${sum}/3 = ${middle} pontos. Somar apenas ou dividir por dois não calcula a média dessas três notas.`, "Média aritmética simples: soma dos valores dividida pela quantidade", " pontos");
  }
  for (const [workers, nextWorkers, hours] of [[4, 6, 12], [4, 8, 10], [3, 6, 16], [5, 10, 12], [6, 9, 18]]) {
    const answer = workers * hours / nextWorkers;
    add({ kind: "workers", numbers: [workers, nextWorkers, hours] }, "Proporcionalidade inversa", `${workers} pessoas realizam uma tarefa em ${hours} horas. Mantendo a mesma produtividade individual e sem interferências, em quantas horas ${nextWorkers} pessoas realizariam a mesma tarefa?`, answer, [hours * nextWorkers / workers, hours, hours - (nextWorkers - workers)], `A quantidade total de trabalho é ${workers} × ${hours} = ${workers * hours} pessoas-hora. Com ${nextWorkers} pessoas, o tempo é ${workers * hours}/${nextWorkers} = ${format(answer)} horas. Mais pessoas reduzem o tempo nessa hipótese.`, "Grandezas inversamente proporcionais: pessoas × tempo constante", " horas", "MEDIO");
  }
  for (const [a, b] of [[50, 40], [30, 20], [40, 20], [25, 40], [20, 50]]) {
    const answer = a * b / 100;
    add({ kind: "probability", numbers: [a, b] }, "Probabilidade: eventos independentes", `Dois eventos independentes têm probabilidades de ${a}% e ${b}%. Qual é a probabilidade de os dois ocorrerem simultaneamente?`, answer, [a + b, (a + b) / 2, Math.abs(a - b)], `Para eventos independentes, multiplicamos as probabilidades: (${a}/100) × (${b}/100) = ${format(a * b / 10000)}. Convertendo para porcentagem, obtemos ${format(answer)}%. Soma, média e diferença não calculam essa interseção.`, "Probabilidade de eventos independentes: P(A ∩ B) = P(A) × P(B)", "%", "MEDIO");
  }
  const logic: Array<[boolean, boolean, LogicProof["operator"], string, boolean, string]> = [
    [true, false, "and", "P ∧ Q (conjunção)", false, "Uma conjunção é verdadeira somente quando as duas proposições são verdadeiras."],
    [true, false, "or", "P ∨ Q (disjunção inclusiva)", true, "A disjunção inclusiva é verdadeira quando ao menos uma das proposições é verdadeira."],
    [false, true, "implies", "P → Q (condicional)", true, "Uma condicional é falsa somente com antecedente verdadeiro e consequente falso."],
    [true, false, "implies", "P → Q (condicional)", false, "Uma condicional é falsa quando seu antecedente é verdadeiro e seu consequente é falso."],
    [false, false, "equivalent", "P ↔ Q (bicondicional)", true, "Uma bicondicional é verdadeira quando as duas proposições têm o mesmo valor lógico."],
  ];
  for (const [p, q, operator, expression, answer, rule] of logic) add({ kind: "logic", p, q, operator }, "Lógica proposicional: tabela-verdade", `Considere P ${p ? "verdadeira" : "falsa"} e Q ${q ? "verdadeira" : "falsa"}. Qual é o valor lógico de ${expression}?`, answer, [!answer], `${answer ? "Verdadeiro" : "Falso"}. ${rule} Substituindo P por ${p ? "verdadeiro" : "falso"} e Q por ${q ? "verdadeiro" : "falso"}, o resultado é ${answer ? "verdadeiro" : "falso"}.`, "Lógica proposicional: tabela-verdade dos conectivos", "", "MEDIO");
  if (bank.length !== 30 || new Set(bank.map((item) => item.fingerprint)).size !== bank.length) throw new Error("STARTER_BANK_INVALID");
  return bank;
}
