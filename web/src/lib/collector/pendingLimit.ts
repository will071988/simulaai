import { aiConfig } from "../ai/config";

export function pendingLimit(request: Request): 1 | 5 | null {
  const values = new URL(request.url).searchParams.getAll("limit");
  if (!values.length) return 5;
  if (values.length !== 1) return null;
  return values[0] === "1" ? 1 : values[0] === "5" ? 5 : null;
}

export function pendingClaimArguments(limit: 1 | 5): { p_limit: 1 | 5 } {
  return { p_limit: limit };
}

// Optional authenticated gate context. It filters env order; it cannot reorder it.
export function pendingProviderOrder(request: Request): string[] | undefined | null {
  const header = request.headers.get("x-ai-healthy-providers");
  if (header === null) return undefined;
  const names = header.split(",");
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !aiConfig.providerOrder.includes(name) || !["openrouter", "groq", "gemini", "cerebras"].includes(name))) return null;
  return aiConfig.providerOrder.filter((name) => names.includes(name));
}
