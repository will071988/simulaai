import assert from "node:assert/strict";
import { supabaseService } from "../src/lib/supabase-server";
import { generateWithFallback } from "../src/lib/ai/router";
import { GenerationBudget } from "../src/lib/ai/generationBudget";
import { EXTRACT_CONCURSO_PROMPT } from "../src/lib/collector/extractConcursoWithAI";
import { ExtractConcursoSchema, type ExtractConcurso } from "../src/lib/collector/schemas";

const EXPECTED_HOST = "ukwulespvvthyjqgrjfo.supabase.co";
const DOCUMENT_ID = "bbd807a7-f4a9-44e5-bdd3-fc0e981696ff";

async function main() {
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname, EXPECTED_HOST);
  assert.equal(process.env.AI_ENABLED, "true");
  assert.equal(process.env.FREE_AI_ONLY, "true");
  assert.equal(process.env.AI_PROVIDER_ORDER, "openrouter");
  assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required");

  const { data: document, error } = await supabaseService().from("collector_documents")
    .select("title,raw_text")
    .eq("id", DOCUMENT_ID)
    .single();
  assert.equal(error, null, error?.message);
  const budget = new GenerationBudget(6);
  const attempts: Array<Record<string, unknown>> = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await generateWithFallback<ExtractConcurso>({
      taskType: "EXTRACT_CONCURSO",
      prompt: EXTRACT_CONCURSO_PROMPT,
      input: { title: document.title, snippet: (document.raw_text || "").slice(0, 4000) },
      promptVersion: `extract_concurso_v3_live_smoke_20260930_${attempt}`,
    }, { validate: (data) => ExtractConcursoSchema.safeParse(data).success, budget });
    const schemaValid = result.ok && ExtractConcursoSchema.safeParse(result.data).success;
    attempts.push({ attempt, ok: result.ok, provider: result.provider, model: result.model, cached: result.cached || false, latencyMs: result.latencyMs, schemaValid, errorCode: result.errorCode || null });
    if (schemaValid) break;
  }
  const passed = attempts.some((attempt) => attempt.ok === true && attempt.schemaValid === true && attempt.cached === false);
  console.log(JSON.stringify({ projectRef: "ukwulespvvthyjqgrjfo", documentId: DOCUMENT_ID, physicalCalls: budget.calls, passed, attempts }, null, 2));
  assert.equal(passed, true, "OpenRouter did not return a valid uncached schema in three physical calls");
}

main();
