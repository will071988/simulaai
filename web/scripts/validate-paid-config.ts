import assert from "node:assert/strict";
import { aiConfig, calculateOpenAICost, isProviderModelAllowed } from "../src/lib/ai/config";

const model = "gpt-5.4-mini-2026-03-17";
const price = aiConfig.openaiPricing[model];

assert.deepEqual(aiConfig.openaiFallbackModels, [model]);
assert.deepEqual(price, { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 });
assert.equal(aiConfig.openaiMaxCallsPerDay, 5);
assert.equal(aiConfig.openaiMaxSpendUsdPerDay, 1);
assert.equal(aiConfig.openaiMaxPaidAttemptsPerJob, 1);
assert.equal(aiConfig.freeOnly, true);
assert.equal(isProviderModelAllowed("openai", model), false);

assert.equal(calculateOpenAICost({ inputTokens: 1_000_000, outputTokens: 0 }, price), 0.75);
assert.equal(calculateOpenAICost({ inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 }, price), 0.075);
assert.equal(calculateOpenAICost({ inputTokens: 0, outputTokens: 1_000_000 }, price), 4.5);
assert.equal(calculateOpenAICost({ inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 1_000_000 }, price), 5.08125);
assert.equal(calculateOpenAICost({ inputTokens: 1, cachedInputTokens: 2, outputTokens: 1 }, price), null);
assert.equal(calculateOpenAICost({ inputTokens: 1, outputTokens: Number.NaN }, price), null);

console.log("paid OpenAI local configuration, pricing units and FREE_AI_ONLY block passed");
