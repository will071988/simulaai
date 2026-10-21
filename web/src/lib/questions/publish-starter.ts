import type { SupabaseClient } from "@supabase/supabase-js";
import { starterBank, STARTER_BANK_REVISION } from "./starter-bank";
import { toDraftPersistence } from "./generation";
import { explanationCacheKey } from "../explanations/quality";

const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry);

export async function publishStarterBank(service: SupabaseClient, actorId: string) {
  const bank = starterBank(); // Every item is checked against its arithmetic/truth-table proof.
  const fingerprints = bank.map((item) => item.fingerprint);
  const fields = "id,question_fingerprint,concurso_id,disciplina,assunto,subassunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,banca,ano,cargo,source_url,source_type,quality_status,validated_by";
  const read = () => service.from("questoes").select(fields).in("question_fingerprint", fingerprints);
  let result = await read();
  if (result.error) throw new Error("STARTER_READ_FAILED");
  const known = new Set((result.data || []).map((row) => row.question_fingerprint));
  const missing = bank.filter((item) => !known.has(item.fingerprint));
  if (missing.length) {
    const inserted = await service.from("questoes").insert(missing.map((item) => toDraftPersistence(item.question)));
    if (inserted.error) throw new Error("STARTER_DRAFT_INSERT_FAILED");
  }
  result = await read();
  if (result.error || result.data?.length !== bank.length) throw new Error("STARTER_READBACK_FAILED");
  const rows = result.data!;
  for (const item of bank) {
    const row = rows.find((candidate) => candidate.question_fingerprint === item.fingerprint)!;
    const { quality_status: _quality, ...expected } = toDraftPersistence(item.question);
    void _quality;
    for (const [field, value] of Object.entries(expected)) if (canonical(row[field as keyof typeof row]) !== canonical(value)) throw new Error("STARTER_EXISTING_CONTENT_MISMATCH");
    if (row.quality_status === "REJECTED") throw new Error("STARTER_REJECTED_CONTENT_REQUIRES_REVIEW");
    if (row.quality_status === "VALIDATED" && !row.validated_by?.startsWith(`starter:${STARTER_BANK_REVISION}:`)) throw new Error("STARTER_FOREIGN_REVIEW_PRESERVED");
  }
  const drafts = rows.filter((row) => row.quality_status === "DRAFT").map((row) => row.id);
  if (drafts.length) {
    const validated = await service.from("questoes").update({ quality_status: "VALIDATED", validated_at: new Date().toISOString(), validated_by: `starter:${STARTER_BANK_REVISION}:${actorId}:math-proof`, validation_errors: [] }).in("id", drafts).eq("quality_status", "DRAFT");
    if (validated.error) throw new Error("STARTER_VALIDATION_FAILED");
  }
  const explanations = bank.map((item) => ({ cache_key: explanationCacheKey({ fingerprint: item.fingerprint }, STARTER_BANK_REVISION), correct_answer: item.explanation.correctAnswer, explanation: item.explanation.explanation, wrong_alternatives: item.explanation.wrongAlternatives, conceptual_reference: item.explanation.conceptualReference, explanation_quality: item.explanation.explanationQuality, confidence: item.explanation.confidence, quality_status: "VALIDATED", source: "AI_ASSISTED", input_tokens: 0, output_tokens: 0 }));
  const insertedExplanations = await service.from("explanation_cache").upsert(explanations, { onConflict: "cache_key", ignoreDuplicates: true });
  if (insertedExplanations.error) throw new Error("STARTER_EXPLANATION_WRITE_FAILED");
  const cached = await service.from("explanation_cache").select("id,cache_key,correct_answer,explanation,wrong_alternatives,conceptual_reference,explanation_quality,confidence,quality_status,source,input_tokens,output_tokens").in("cache_key", explanations.map((item) => item.cache_key));
  if (cached.error || cached.data?.length !== bank.length) throw new Error("STARTER_EXPLANATION_READ_FAILED");
  for (const expected of explanations) {
    const row = cached.data!.find((item) => item.cache_key === expected.cache_key)!;
    for (const [field, value] of Object.entries(expected)) {
      const stored = row[field as keyof typeof row];
      if (typeof value === "number" ? Number(stored) !== value : canonical(stored) !== canonical(value)) throw new Error(`STARTER_EXPLANATION_MISMATCH_${field.toUpperCase()}`);
    }
  }
  const links = bank.map((item) => ({ questao_id: rows.find((row) => row.question_fingerprint === item.fingerprint)!.id, explanation_id: cached.data!.find((row) => row.cache_key === explanationCacheKey({ fingerprint: item.fingerprint }, STARTER_BANK_REVISION))!.id }));
  const currentLinks = await service.from("question_explanations").select("questao_id,explanation_id").in("questao_id", links.map((link) => link.questao_id));
  if (currentLinks.error) throw new Error("STARTER_LINK_READ_FAILED");
  for (const link of currentLinks.data || []) if (links.find((expected) => expected.questao_id === link.questao_id)?.explanation_id !== link.explanation_id) throw new Error("STARTER_FOREIGN_EXPLANATION_PRESERVED");
  const linked = await service.from("question_explanations").upsert(links, { onConflict: "questao_id", ignoreDuplicates: true });
  if (linked.error) throw new Error("STARTER_LINK_WRITE_FAILED");
  const unpublished = rows.filter((row) => row.quality_status !== "PUBLISHED").map((row) => row.id);
  if (unpublished.length) {
    const published = await service.from("questoes").update({ quality_status: "PUBLISHED" }).in("id", unpublished).eq("quality_status", "VALIDATED");
    if (published.error) throw new Error("STARTER_PUBLICATION_FAILED");
  }
  const final = await read();
  if (final.error || final.data?.filter((row) => row.quality_status === "PUBLISHED").length !== bank.length) throw new Error("STARTER_PUBLICATION_READBACK_FAILED");
  return { revision: STARTER_BANK_REVISION, publishedQuestions: bank.length, insertedQuestions: missing.length, alreadyPublished: rows.filter((row) => row.quality_status === "PUBLISHED").length, explanations: explanations.length, providerCalls: 0, verification: "arithmetic-and-truth-tables", questionOrigin: "QUESTAO_IA" };
}
