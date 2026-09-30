export const aiConfig = {
  groqModel: process.env.AI_GROQ_MODEL || "openai/gpt-oss-20b",
  geminiModel: process.env.AI_GEMINI_MODEL || "gemini-2.5-flash",
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

export function isModelAllowed(model: string): boolean {
  if (!aiConfig.freeOnly) return true;
  // OpenRouter publishes zero-cost variants with the canonical :free suffix.
  // The generic free router is also zero-cost by contract.
  if (model === "openrouter/free") return true;
  if (model.endsWith(":free")) return true;
  return aiConfig.freeAllowed.has(model);
}
