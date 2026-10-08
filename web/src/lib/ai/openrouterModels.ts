export const OPENROUTER_FREE_CANDIDATES = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "liquid/lfm-2.5-2.6b:free",
  "apodex/apodex-1.1-mini:free",
  "dots-studio/dots-3-note-preview:free",
  "openrouter/free",
] as const;

type CatalogModel = { id: string; pricing?: Record<string, unknown>; context_length?: number; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: string[] };
export type ModelApproval = { ok: boolean; errorCode?: string; contextLength?: number; promptPrice?: unknown; completionPrice?: unknown };
function zeroPrice(price: unknown): boolean {
  if (typeof price === "number") return Number.isFinite(price) && price === 0;
  return typeof price === "string" && /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(price) && Number(price) === 0;
}
export function approveFreeModel(model: string, catalog: unknown): ModelApproval {
  if (!(OPENROUTER_FREE_CANDIDATES as readonly string[]).includes(model)) return { ok: false, errorCode: "MODEL_UNAVAILABLE" };
  const data = (catalog as { data?: CatalogModel[] } | null)?.data;
  if (!Array.isArray(data)) return { ok: false, errorCode: "MODEL_UNAVAILABLE" };
  const record = data.find((entry) => entry.id === model);
  if (!record) return { ok: false, errorCode: "MODEL_UNAVAILABLE" };
  if (!zeroPrice(record.pricing?.prompt) || !zeroPrice(record.pricing?.completion) || (record.pricing?.request !== undefined && !zeroPrice(record.pricing.request))) return { ok: false, errorCode: "MODEL_NOT_FREE" };
  if (!record.architecture?.input_modalities?.includes("text") || !record.architecture.output_modalities?.includes("text") || !record.supported_parameters?.includes("response_format")) return { ok: false, errorCode: "MODEL_UNAVAILABLE" };
  return { ok: true, contextLength: record.context_length, promptPrice: record.pricing?.prompt, completionPrice: record.pricing?.completion };
}
export async function fetchOpenRouterCatalog(): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store", signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) { await response.body?.cancel(); throw new Error("MODEL_CATALOG_UNAVAILABLE"); }
  return response.json();
}
export async function validateLiveFreeModel(model: string): Promise<ModelApproval> {
  try { return approveFreeModel(model, await fetchOpenRouterCatalog()); }
  catch { return { ok: false, errorCode: "MODEL_UNAVAILABLE" }; }
}
export function configuredOpenRouterModels(): string[] {
  const value = process.env.AI_OPENROUTER_MODEL_ORDER;
  const models = value ? value.split(",").map((item) => item.trim()) : [process.env.AI_OPENROUTER_MODEL || "openrouter/free"];
  if (models.length > 3 || !models.length || new Set(models).size !== models.length || models.some((model) => !(OPENROUTER_FREE_CANDIDATES as readonly string[]).includes(model)) || (models.includes("openrouter/free") && models.at(-1) !== "openrouter/free")) return [];
  return models;
}
