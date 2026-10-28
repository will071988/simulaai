/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { aiConfig, configuredPolicy } from "../src/lib/ai/config";
import { generateWithFallback, type RouterDependencies } from "../src/lib/ai/router";
import { GenerationBudget } from "../src/lib/ai/generationBudget";
import type { AIProvider } from "../src/lib/ai/provider";

const request = { taskType: "EXTRACT_CONCURSO" as const, prompt: "fixture", input: { id: "job-1" }, promptVersion: "paid-fallback-fixture", maxTokens: 10 };
const originalFetch = globalThis.fetch;
const original = { policy: aiConfig.policy, freeOnly: aiConfig.freeOnly, models: aiConfig.openaiFallbackModels, calls: aiConfig.openaiMaxCallsPerDay, spend: aiConfig.openaiMaxSpendUsdPerDay, attempts: aiConfig.openaiMaxPaidAttemptsPerJob, pricing: aiConfig.openaiPricing };

class FixtureProvider implements AIProvider {
  constructor(public name: string, public model: string, private readonly result: any) {}
  async healthCheck() { return { healthy: true }; }
  async generate<T>() { return { ...this.result, provider: this.name, model: this.model, latencyMs: 1 } as any as import("../src/lib/ai/types").AIResult<T>; }
}

let paidCalls = 0;
let paidResponses: Response[] = [];
const logs: Array<Record<string, unknown>> = [];
let reserved = 0;
let reserveAllowed = true;
const cache = new Map<string, unknown>();

function deps(order: string[], free: Record<string, AIProvider> = {}): RouterDependencies {
  return {
    providers: () => free,
    order,
    getCached: async <T>(hash: string) => (cache.get(hash) as T | undefined) ?? null,
    setCached: async (hash, _version, _provider, _model, data) => { cache.set(hash, data); },
    logUsage: async (...args: any[]) => { logs.push({ args }); },
    reserveBudget: async () => true,
    paidBudget: async () => { if (!reserveAllowed) return false; reserved++; return true; },
    openAIKeys: () => [{ key: "fixture-secret-1", index: 1 }, { key: "fixture-secret-2", index: 2 }],
    configured: () => true,
    modelAllowed: () => true,
    sleep: async () => {},
  };
}

async function run() {
  process.env.AI_PROVIDER_POLICY = "free_only";
  process.env.FREE_AI_ONLY = "false";
  assert.equal(configuredPolicy(), "free_only");
  process.env.AI_PROVIDER_POLICY = "free_then_paid";
  assert.equal(configuredPolicy(), "free_then_paid");
  aiConfig.policy = "free_then_paid"; aiConfig.freeOnly = false; aiConfig.openaiFallbackModels = ["fixture-model"];
  aiConfig.openaiMaxCallsPerDay = 5; aiConfig.openaiMaxSpendUsdPerDay = 1; aiConfig.openaiMaxPaidAttemptsPerJob = 3;
  aiConfig.openaiPricing = { "fixture-model": { inputPerMillion: 1, outputPerMillion: 1 } };

  const success = { ok: true, data: { ok: true }, raw: '{"ok":true}' };
  paidResponses = [new Response(JSON.stringify({ model: "fixture-model", choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }), { status: 200 })];
  globalThis.fetch = async () => { paidCalls++; return paidResponses.shift()!; };

  paidCalls = 0;
  const freeOk = await generateWithFallback(request, { budget: new GenerationBudget(5), validate: (v) => Boolean((v as any)?.ok) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", success) }));
  assert.equal(freeOk.ok, true); assert.equal(paidCalls, 0); // 1

  const freeThenFree = await generateWithFallback(request, { budget: new GenerationBudget(5) }, deps(["groq", "gemini"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }), gemini: new FixtureProvider("gemini", "free", success) }));
  assert.equal(freeThenFree.ok, true); assert.equal(paidCalls, 0); // 2

  const paid = await generateWithFallback({ ...request, input: { id: "paid-1" } }, { budget: new GenerationBudget(5), validate: (v) => Boolean((v as any)?.ok) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(paid.ok, true); assert.equal(paid.provider, "openai"); assert.equal(paidCalls, 1); // 3

  aiConfig.policy = "free_only";
  const blocked = await generateWithFallback({ ...request, input: { id: "blocked" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(blocked.ok, false); assert.equal(paidCalls, 1); // 4, 5
  aiConfig.policy = "free_then_paid";

  const statuses = [new Response(JSON.stringify({ error: { code: "invalid_api_key" } }), { status: 401 }), new Response(JSON.stringify({ model: "fixture-model", choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 })];
  globalThis.fetch = async () => { paidCalls++; return statuses.shift()!; };
  const rotated = await generateWithFallback({ ...request, input: { id: "rotate" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(rotated.ok, true); assert.equal(rotated.keyIndex, 2); // 6

  const rate = [new Response("{}", { status: 429, headers: { "retry-after": "2" } }), new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })];
  globalThis.fetch = async () => { paidCalls++; return rate.shift()!; };
  const rateResult = await generateWithFallback({ ...request, input: { id: "rate" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(rateResult.ok, true); assert.equal(paidCalls >= 4, true); // 7

  globalThis.fetch = async () => { paidCalls++; return new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }); };
  const quota = await generateWithFallback({ ...request, input: { id: "quota" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(quota.errorCode, "PAID_QUOTA_EXHAUSTED"); // 8

  globalThis.fetch = async () => { paidCalls++; return new Response("{}", { status: 500 }); };
  await generateWithFallback({ ...request, input: { id: "server" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(paidCalls <= 8, true); // 9: bounded, no loop

  globalThis.fetch = async () => { paidCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }); };
  const invalid = await generateWithFallback({ ...request, input: { id: "invalid" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(invalid.ok, false); assert.equal(invalid.errorCode, "INVALID_JSON"); // 10

  reserveAllowed = false;
  const budgetBlocked = await generateWithFallback({ ...request, input: { id: "budget" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(budgetBlocked.ok, false); assert.equal(reserved > 0, true); // 11
  reserveAllowed = true;

  const concurrentDeps = deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) });
  let concurrentReservations = 0; concurrentDeps.paidBudget = async () => { if (concurrentReservations) return false; concurrentReservations++; return true; };
  globalThis.fetch = async () => { paidCalls++; return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }); };
  await Promise.all([generateWithFallback({ ...request, input: { id: "same" } }, { budget: new GenerationBudget(5) }, concurrentDeps), generateWithFallback({ ...request, input: { id: "same" } }, { budget: new GenerationBudget(5) }, concurrentDeps)]); // 12

  const noKeysBase = deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) });
  const noKeys = { ...noKeysBase, openAIKeys: () => [] };
  assert.equal((await generateWithFallback({ ...request, input: { id: "nokey" } }, { budget: new GenerationBudget(5) }, noKeys)).errorCode, "PAID_KEY_NOT_CONFIGURED"); // 13
  assert.equal(logs.some((entry) => JSON.stringify(entry).includes("fixture-secret")), false); // 14
  const final = await generateWithFallback({ ...request, input: { id: "final" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "INVALID_INPUT" }) }));
  assert.equal(final.ok, false); // 15
  cache.clear();
  const before = paidCalls; const first = await generateWithFallback({ ...request, input: { id: "cache" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  const second = await generateWithFallback({ ...request, input: { id: "cache" } }, { budget: new GenerationBudget(5) }, deps(["groq"], { groq: new FixtureProvider("groq", "free", { ok: false, errorCode: "HTTP_5XX" }) }));
  assert.equal(first.ok, true); assert.equal(second.cached, true); assert.equal(paidCalls, before + 1); // 16
}

run().finally(() => { globalThis.fetch = originalFetch; aiConfig.policy = original.policy; aiConfig.freeOnly = original.freeOnly; aiConfig.openaiFallbackModels = original.models; aiConfig.openaiMaxCallsPerDay = original.calls; aiConfig.openaiMaxSpendUsdPerDay = original.spend; aiConfig.openaiMaxPaidAttemptsPerJob = original.attempts; aiConfig.openaiPricing = original.pricing; }).then(() => console.log("paid fallback mocked regression scenarios passed"));
