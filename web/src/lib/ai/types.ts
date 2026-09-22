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
};

export type AIProviderHealth = { healthy: boolean; latencyMs?: number };
