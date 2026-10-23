import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import type { GenerationPermit } from "./generationBudget";
import { isProviderModelAllowed } from "./config";
import { openAICompletion } from "./structured";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(public model = process.env.AI_OPENAI_MODEL || "") {}
  async healthCheck() {
    return { healthy: Boolean(process.env.OPENAI_API_KEY) && isProviderModelAllowed(this.name, this.model) };
  }
  async generate<T>(req: AIRequest, permit?: GenerationPermit): Promise<AIResult<T>> {
    if (!process.env.OPENAI_API_KEY) return { ok: false, provider: this.name, model: this.model, latencyMs: 0, errorCode: "SKIPPED_NOT_CONFIGURED" };
    // Direct OpenAI has no verified zero-price contract in this FREE-ONLY app.
    if (!isProviderModelAllowed(this.name, this.model)) return { ok: false, provider: this.name, model: this.model, latencyMs: 0, errorCode: "AUTH_CONFIGURATION_ERROR" };
    return openAICompletion<T>(this.name, this.model, "https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY, req, permit);
  }
  async generateStructured<T>(req: AIRequest, permit?: GenerationPermit) {
    const result = await this.generate<T>(req, permit);
    return { ...result, success: result.ok, requestedModel: result.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN" };
  }
}
