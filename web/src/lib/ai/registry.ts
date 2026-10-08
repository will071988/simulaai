import { OpenRouterProvider } from "./openrouter";
import { GroqProvider } from "./groq";
import { GeminiProvider, geminiKey } from "./gemini";
import { CerebrasProvider } from "./cerebras";
import type { AIProvider } from "./provider";

export function createProviders(): Record<string, AIProvider> {
  return { openrouter: new OpenRouterProvider(), groq: new GroqProvider(), gemini: new GeminiProvider(), cerebras: new CerebrasProvider() };
}
export function providerConfigured(name: string): boolean {
  return Boolean(({ openrouter: process.env.OPENROUTER_API_KEY, groq: process.env.GROQ_API_KEY, gemini: geminiKey(), cerebras: process.env.CEREBRAS_API_KEY } as Record<string, string | undefined>)[name]);
}
