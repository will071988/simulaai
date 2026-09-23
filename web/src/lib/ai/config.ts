export const aiConfig = {
  groqModel: process.env.AI_GROQ_MODEL || "openai/gpt-oss-20b",
  geminiModel: process.env.AI_GEMINI_MODEL || "gemini-2.5-flash",
  openRouterModel: process.env.AI_OPENROUTER_MODEL || "openrouter/free",
  freeOnly: process.env.FREE_AI_ONLY !== "false",
  providerOrder: (process.env.AI_PROVIDER_ORDER || "groq,openrouter").split(",").map((s) => s.trim().toLowerCase()),
  maxPerRun: Number(process.env.MAX_AI_REQUESTS_PER_RUN || 30),
  maxPerDay: Number(process.env.MAX_AI_REQUESTS_PER_DAY || 300),
  // allowlist de modelos gratuitos confirmados (FREE_AI_ONLY=true)
  freeAllowed: new Set([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "openrouter/free",
  ]),
};

export function isModelAllowed(model: string): boolean {
  if (!aiConfig.freeOnly) return true;
  // normalize: allow prefix match for openrouter/free
  if (model === "openrouter/free") return true;
  return aiConfig.freeAllowed.has(model);
}
