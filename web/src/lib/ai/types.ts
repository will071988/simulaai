export type AITaskType = "EXTRACT_CONCURSO" | "CLASSIFY_QUESTION" | "EXTRACT_QUESTION" | "SUMMARIZE_NOTICE" | "GENERATE_QUESTION" | "EXPLAIN_ANSWER";

export type AIRequest = {
  taskType: AITaskType;
  prompt: string;
  input: unknown;
  schema?: unknown;
  promptVersion: string;
  maxTokens?: number;
  reasoningPolicy?: "provider-default" | "disabled";
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
  validationIssues?: string[];
  semanticIssues?: string[];
  groundingRecoveredFields?: string[];
  effectiveModel?: string;
  httpStatus?: number;
  timeoutSource?: "CLIENT_ABORT_SIGNAL" | "NETWORK_TIMEOUT" | "OPENROUTER_OR_UPSTREAM";
  jsonClassification?: string;
  parseSuccess?: boolean;
  bodyPresent?: boolean;
  rateLimit?: { retryAfter?: string; limit?: string; remaining?: string; reset?: string };
  upstreamError?: { code?: string; message?: string };
  success?: boolean;
  requestedModel?: string;
  generationDiagnostics?: { finishReason: string | null; completionTokens: number | null; reasoningTokens: number | null; visibleTokens: number | null; reasoningPresent: boolean; reasoningBudgetExhausted: boolean };
  attempts?: Array<{ provider: string; requestedModel: string; effectiveModel: string; errorCode?: string; latencyMs: number }>;
};

export type AIProviderHealth = { healthy: boolean; latencyMs?: number; errorCode?: string; credentialHttpStatus?: number };
