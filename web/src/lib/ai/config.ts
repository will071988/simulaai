export type AIProviderPolicy = "free_only" | "free_then_paid";

export function configuredPolicy(): AIProviderPolicy {
  const explicit = process.env.AI_PROVIDER_POLICY?.trim().toLowerCase();
  if (explicit === "free_only" || explicit === "free_then_paid") return explicit;
  return process.env.FREE_AI_ONLY === "false" ? "free_then_paid" : "free_only";
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const aiConfig = {
  groqModel: process.env.AI_GROQ_MODEL || "",
  geminiModel: process.env.AI_GEMINI_MODEL || "",
  cerebrasModel: process.env.AI_CEREBRAS_MODEL || "",
  openRouterModel: process.env.AI_OPENROUTER_MODEL || "openrouter/free",
  policy: configuredPolicy(),
  freeOnly: configuredPolicy() === "free_only",
  providerOrder: (process.env.AI_PROVIDER_ORDER || "openrouter").split(",").map((s) => s.trim().toLowerCase()),
  maxPerRun: Number(process.env.MAX_AI_REQUESTS_PER_RUN || 10),
  maxPerDay: Number(process.env.MAX_AI_REQUESTS_PER_DAY || 50),
  openaiFallbackModels: (process.env.OPENAI_FALLBACK_MODELS || process.env.AI_OPENAI_MODEL || "").split(",").map((s) => s.trim()).filter(Boolean),
  openaiMaxCallsPerDay: positiveNumber(process.env.OPENAI_MAX_CALLS_PER_DAY, 0),
  openaiMaxSpendUsdPerDay: positiveNumber(process.env.OPENAI_MAX_SPEND_USD_PER_DAY, 0),
  openaiMaxPaidAttemptsPerJob: positiveNumber(process.env.OPENAI_MAX_PAID_ATTEMPTS_PER_JOB, 1),
  openaiPricing: (() => {
    try {
      const value = process.env.OPENAI_PRICING_JSON;
      if (!value) return {} as Record<string, { inputPerMillion: number; outputPerMillion: number }>;
      const parsed = JSON.parse(value) as Record<string, { inputPerMillion?: number; outputPerMillion?: number }>;
      return Object.fromEntries(Object.entries(parsed).flatMap(([model, price]) => typeof price.inputPerMillion === "number" && typeof price.outputPerMillion === "number" && Number.isFinite(price.inputPerMillion) && Number.isFinite(price.outputPerMillion) && price.inputPerMillion >= 0 && price.outputPerMillion >= 0 ? [[model, { inputPerMillion: price.inputPerMillion, outputPerMillion: price.outputPerMillion }]] : []));
    } catch { return {} as Record<string, { inputPerMillion: number; outputPerMillion: number }>; }
  })(),
  // allowlist de modelos gratuitos confirmados (FREE_AI_ONLY=true)
  freeAllowed: new Set([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openrouter/free",
  ]),
};

console.info(JSON.stringify({ event: "ai_provider_policy", policy: aiConfig.policy }));

export function isProviderModelAllowed(provider: string, model: string): boolean {
  if (!model) return false;
  if (provider === "openai") return !aiConfig.freeOnly && (aiConfig.openaiFallbackModels.includes(model) || model === process.env.AI_OPENAI_MODEL);
  if (!aiConfig.freeOnly) return true;
  if (provider === "openrouter") return model === "openrouter/free" || model.endsWith(":free");
  // Free-tier and model availability belong to the account, not the model name.
  // Non-OpenRouter providers remain blocked until a free-only account is confirmed.
  return ["groq", "gemini", "cerebras"].includes(provider)
    && process.env[`AI_${provider.toUpperCase()}_FREE_TIER_CONFIRMED`] === "true"
    && model === process.env[`AI_${provider.toUpperCase()}_MODEL`];
}

export function configuredOpenAIModels(): string[] {
  if (aiConfig.openaiFallbackModels.length) return aiConfig.openaiFallbackModels;
  return process.env.AI_OPENAI_MODEL ? [process.env.AI_OPENAI_MODEL] : [];
}

export function isModelAllowed(model: string): boolean {
  if (!aiConfig.freeOnly) return true;
  // OpenRouter publishes zero-cost variants with the canonical :free suffix.
  // The generic free router is also zero-cost by contract.
  if (model === "openrouter/free") return true;
  if (model.endsWith(":free")) return true;
  return aiConfig.freeAllowed.has(model);
}
