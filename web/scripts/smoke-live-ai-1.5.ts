import assert from "node:assert/strict";
import { supabaseService } from "../src/lib/supabase-server";
import { generateWithFallback, smokeDependencies } from "../src/lib/ai/router";
import { GenerationBudget } from "../src/lib/ai/generationBudget";
import { EXTRACT_CONCURSO_PROMPT } from "../src/lib/collector/extractConcursoWithAI";
import { ExtractConcursoSchema, type ExtractConcurso } from "../src/lib/collector/schemas";
import { buildGroundedExtraction } from "../src/lib/collector/extractionGrounding";
import { extractionSemanticIssues } from "../src/lib/collector/extractionSemantics";

const EXPECTED_HOST = "ukwulespvvthyjqgrjfo.supabase.co";
const DOCUMENT_ID = "bbd807a7-f4a9-44e5-bdd3-fc0e981696ff";

async function main() {
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname, EXPECTED_HOST);
  assert.equal(process.env.AI_ENABLED, "true");
  assert.equal(process.env.FREE_AI_ONLY, "true");
  assert.ok(process.env.AI_PROVIDER_ORDER?.split(",").includes("openrouter"));
  assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required");

  const { data: document, error } = await supabaseService().from("collector_documents")
    .select("title,raw_text,metadata")
    .eq("id", DOCUMENT_ID)
    .single();
  assert.equal(error, null, error?.message);
  const budget = new GenerationBudget(1);
  const title = document.metadata?.identity_title || document.title;
  const sourceName = document.metadata?.source_name;
  const grounded = buildGroundedExtraction(title, document.raw_text || "", sourceName);
  const result = await generateWithFallback<ExtractConcurso>({
    taskType: "EXTRACT_CONCURSO",
    prompt: EXTRACT_CONCURSO_PROMPT,
    input: grounded.input,
    schema: grounded.schema,
    promptVersion: "extract_concurso_v7_live_smoke",
    reasoningPolicy: process.env.AI_EXTRACT_REASONING_POLICY === "disabled" ? "disabled" : "provider-default",
  }, { decode: grounded.decode, validate: (data) => ExtractConcursoSchema.safeParse(data).success, semanticValidate: (data) => { const parsed = ExtractConcursoSchema.safeParse(data); return parsed.success && extractionSemanticIssues(parsed.data, title, document.raw_text || "", sourceName).length === 0; }, budget }, smokeDependencies("openrouter"));
  const schemaValid = result.ok && ExtractConcursoSchema.safeParse(result.data).success;
  const attempts = [{ attempt: 1, ok: result.ok, provider: result.provider, model: result.model, cached: result.cached || false, latencyMs: result.latencyMs, schemaValid, errorCode: result.errorCode || null }];
  const passed = attempts.some((attempt) => attempt.ok === true && attempt.schemaValid === true && attempt.cached === false);
  console.log(JSON.stringify({ projectRef: "ukwulespvvthyjqgrjfo", documentId: DOCUMENT_ID, physicalCalls: budget.calls, passed, attempts }, null, 2));
  assert.equal(passed, true, "OpenRouter did not return a grounded extraction in one bounded attempt");
}

main();
