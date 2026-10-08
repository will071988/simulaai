export const aiConfig = {
  groqModel: process.env.AI_GROQ_MODEL || "",
  geminiModel: process.env.AI_GEMINI_MODEL || "",
  cerebrasModel: process.env.AI_CEREBRAS_MODEL || "",
  openRouterModel: process.env.AI_OPENROUTER_MODEL || "openrouter/free",
  freeOnly: process.env.FREE_AI_ONLY !== "false",
  providerOrder: (process.env.AI_PROVIDER_ORDER || "openrouter").split(",").map((s) => s.trim().toLowerCase()),
  maxPerRun: Number(process.env.MAX_AI_REQUESTS_PER_RUN || 10),
  maxPerDay: Number(process.env.MAX_AI_REQUESTS_PER_DAY || 50),
  // allowlist de modelos gratuitos confirmados (FREE_AI_ONLY=true)
  freeAllowed: new Set([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openrouter/free",
  ]),
};

export function isProviderModelAllowed(provider: string, model: string): boolean {
  if (!aiConfig.freeOnly || !model) return false;
  if (provider === "openrouter") return model === "openrouter/free" || model.endsWith(":free");
  // Free-tier and model availability belong to the account, not the model name.
  // Non-OpenRouter providers remain blocked until a free-only account is confirmed.
  return ["groq", "gemini", "cerebras"].includes(provider)
    && process.env[`AI_${provider.toUpperCase()}_FREE_TIER_CONFIRMED`] === "true"
    && model === process.env[`AI_${provider.toUpperCase()}_MODEL`];
}

export function isModelAllowed(model: string): boolean {
  if (!aiConfig.freeOnly) return true;
  // OpenRouter publishes zero-cost variants with the canonical :free suffix.
  // The generic free router is also zero-cost by contract.
  if (model === "openrouter/free") return true;
  if (model.endsWith(":free")) return true;
  return aiConfig.freeAllowed.has(model);
}
