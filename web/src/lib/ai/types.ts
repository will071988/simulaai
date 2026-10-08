export type AITaskType = "EXTRACT_CONCURSO" | "CLASSIFY_QUESTION" | "EXTRACT_QUESTION" | "SUMMARIZE_NOTICE" | "GENERATE_QUESTION" | "EXPLAIN_ANSWER";

export type AIRequest = {
  taskType: AITaskType;
  prompt: string;
  input: unknown;
  schema?: unknown;
  promptVersion: string;
  maxTokens?: number;
};

export type AIResult<T> = {
  ok: boolean;
  provider: string;
  model: string;
  data?: T;
  raw?: string;
  latencyMs: number;
  errorCode?: string;
  cached?: boolean;
  effectiveModel?: string;
  httpStatus?: number;
  timeoutSource?: "CLIENT_ABORT_SIGNAL" | "NETWORK_TIMEOUT" | "OPENROUTER_OR_UPSTREAM";
  jsonClassification?: string;
  parseSuccess?: boolean;
  bodyPresent?: boolean;
  success?: boolean;
  requestedModel?: string;
  attempts?: Array<{ provider: string; requestedModel: string; effectiveModel: string; errorCode?: string; latencyMs: number }>;
};

export type AIProviderHealth = { healthy: boolean; latencyMs?: number };
