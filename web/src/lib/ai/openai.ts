import type { AIProvider } from "./provider";
import type { AIRequest, AIResult } from "./types";
import type { GenerationPermit } from "./generationBudget";
import { isProviderModelAllowed } from "./config";
import { openAICompletion } from "./structured";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(public model = process.env.AI_OPENAI_MODEL || "", private readonly key = process.env.OPENAI_API_KEY || "", public readonly keyIndex?: number) {}
  async healthCheck() {
    return { healthy: Boolean(this.key) && isProviderModelAllowed(this.name, this.model), errorCode: !this.key ? "SKIPPED_NOT_CONFIGURED" : undefined };
  }
  async generate<T>(req: AIRequest, permit?: GenerationPermit): Promise<AIResult<T>> {
    if (!this.key) return { ok: false, provider: this.name, model: this.model, latencyMs: 0, errorCode: "SKIPPED_NOT_CONFIGURED", keyIndex: this.keyIndex };
    if (!isProviderModelAllowed(this.name, this.model)) return { ok: false, provider: this.name, model: this.model, latencyMs: 0, errorCode: process.env.FREE_AI_ONLY !== "false" && !process.env.AI_PROVIDER_POLICY ? "AUTH_CONFIGURATION_ERROR" : "PAID_MODEL_BLOCKED", keyIndex: this.keyIndex };
    return { ...await openAICompletion<T>(this.name, this.model, "https://api.openai.com/v1/chat/completions", this.key, req, permit), keyIndex: this.keyIndex };
  }
  async generateStructured<T>(req: AIRequest, permit?: GenerationPermit) {
    const result = await this.generate<T>(req, permit);
    return { ...result, success: result.ok, requestedModel: result.model, effectiveModel: result.effectiveModel || "MODEL_EFFECTIVE_UNKNOWN" };
  }
}
