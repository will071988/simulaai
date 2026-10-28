import { OpenRouterProvider } from "./openrouter";
import { GroqProvider } from "./groq";
import { GeminiProvider, geminiKey } from "./gemini";
import { CerebrasProvider } from "./cerebras";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./provider";
import { aiConfig, configuredOpenAIModels, isProviderModelAllowed } from "./config";
import { configuredOpenRouterModels } from "./openrouterModels";

export function createProviders(): Record<string, AIProvider> {
  return { openrouter: new OpenRouterProvider(), groq: new GroqProvider(), gemini: new GeminiProvider(), cerebras: new CerebrasProvider(), openai: new OpenAIProvider() };
}
export function createOpenRouterModelProvider(model: string): AIProvider { return new OpenRouterProvider(model); }
export function providerConfigured(name: string): boolean {
  if (name === "openai") return openAIKeys().length > 0;
  return Boolean(({ openrouter: process.env.OPENROUTER_API_KEY, groq: process.env.GROQ_API_KEY, gemini: geminiKey(), cerebras: process.env.CEREBRAS_API_KEY } as Record<string, string | undefined>)[name]);
}

export function openAIKeys(): Array<{ key: string; index: number }> {
  return [1, 2, 3, 4, 5].flatMap((index) => {
    const key = process.env[`OPENAI_API_KEY_${index}`]?.trim() || (index === 1 ? process.env.OPENAI_API_KEY?.trim() : "");
    return key ? [{ key, index }] : [];
  });
}

// Configuration only: presence is not authentication or proof of generation.
export function providerConfiguration() {
  return Object.entries(createProviders()).map(([name, provider]) => {
    const configured = providerConfigured(name);
    const models = name === "openrouter" ? configuredOpenRouterModels() : name === "openai" ? configuredOpenAIModels() : provider.model ? [provider.model] : [];
    const allowed = models.length > 0 && models.every((model) => isProviderModelAllowed(name, model));
    const selected = aiConfig.providerOrder.includes(name);
    const enabled = process.env.AI_ENABLED !== "false" && process.env.COLLECTOR_ENABLED !== "false" && configured && allowed && selected;
    const status = !configured ? "NOT_CONFIGURED" : name === "openai" && aiConfig.freeOnly ? "BLOCKED_FREE_ONLY" : !models.length ? "MODEL_NOT_CONFIGURED" : !allowed ? "BLOCKED_FREE_ONLY" : !selected ? "NOT_SELECTED" : enabled ? "ENABLED" : "DISABLED";
    return { provider: name, configured, selected, enabled, models, status };
  });
}
