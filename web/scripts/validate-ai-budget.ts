import assert from "node:assert/strict";
import { GenerationBudget, generationFetch, type GenerationPermit } from "../src/lib/ai/generationBudget";
import { generateWithFallback, type RouterDependencies } from "../src/lib/ai/router";
import type { AIProvider } from "../src/lib/ai/provider";
import type { AIRequest, AIResult } from "../src/lib/ai/types";

const req: AIRequest = { taskType: "EXTRACT_CONCURSO", prompt: "test", input: { public: "fixture" }, promptVersion: "budget-test" };
async function scenario(options: { cached?: boolean; unhealthy?: boolean; blocked?: boolean; missing?: boolean; statuses?: number[]; dailyLimit?: number; runLimit?: number; fallback?: boolean; rpcFails?: boolean; invalidSchema?: boolean }) {
  let reservations = 0, physical = 0;
  const statuses = [...(options.statuses || [200])];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    physical++;
    return new Response(JSON.stringify({ value: "ok" }), { status: statuses.shift() || 200 });
  };
  const provider = (name: string): AIProvider => ({
    name, model: "test/free",
    healthCheck: async () => ({ healthy: !options.unhealthy }),
    async generate<T>(_req: AIRequest, permit?: GenerationPermit): Promise<AIResult<T>> {
      try {
        const response = await generationFetch("https://fixture.invalid/generate", {}, permit);
        return { ok: response.ok, provider: name, model: "test/free", latencyMs: 1, data: response.ok ? await response.json() as T : undefined, errorCode: response.ok ? undefined : response.status >= 500 ? "HTTP_5XX" : String(response.status) };
      } catch {
        return { ok: false, provider: name, model: "test/free", latencyMs: 0, errorCode: "BUDGET_EXCEEDED" };
      }
    },
  });
  const budget = new GenerationBudget(options.runLimit ?? 10);
  const deps: RouterDependencies = {
    providers: (): Record<string, AIProvider> => options.missing ? {} : { a: provider("a"), b: provider("b") },
    order: options.fallback ? ["a", "b"] : ["a"],
    modelAllowed: () => !options.blocked,
    getCached: async <T>() => options.cached ? { value: "cached" } as T : null,
    setCached: async () => {}, logUsage: async () => {}, sleep: async () => {},
    reserveBudget: async () => {
      if (options.rpcFails) throw new Error("RPC_FAILURE");
      if (reservations >= (options.dailyLimit ?? 50)) return false;
      reservations++;
      return true;
    },
  };
  try {
    const result = await generateWithFallback(req, { budget, validate: options.invalidSchema ? () => false : undefined }, deps);
    assert.equal(reservations, physical, "every admitted reservation must correspond to a transport call");
    assert.equal(budget.calls, physical);
    return { reservations, physical, result };
  } finally { globalThis.fetch = originalFetch; }
}

async function main() {
  for (const options of [{ cached: true }, { unhealthy: true }, { blocked: true }, { missing: true }, { rpcFails: true }]) assert.equal((await scenario(options)).physical, 0);
  assert.equal((await scenario({})).reservations, 1);
  assert.equal((await scenario({ statuses: [429, 200] })).reservations, 1, "one attempt per provider, no same-provider retry");
  assert.equal((await scenario({ statuses: [429, 200], fallback: true })).reservations, 2);
  assert.equal((await scenario({ statuses: [503, 200], fallback: true })).reservations, 2);
  const exhausted = await scenario({ statuses: [429, 200], dailyLimit: 1, fallback: true });
  assert.equal(exhausted.physical, 1);
  assert.equal(exhausted.result.errorCode, "BUDGET_EXHAUSTED");
  assert.equal((await scenario({ statuses: [429, 200], runLimit: 1 })).physical, 1);
  assert.equal((await scenario({ invalidSchema: true })).result.errorCode, "INVALID_SCHEMA");
  const shared = new GenerationBudget(2);
  let reserved = 0;
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => shared.reserve(async () => { reserved++; return true; })));
  assert.equal(outcomes.filter(Boolean).length, 2);
  assert.equal(reserved, 2);
  console.log("AI physical budget accounting validation passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
