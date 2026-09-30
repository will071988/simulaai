export type CollectorStage = "discover" | "fetch" | "parse" | "classify" | "extract" | "resolve" | "persist" | "publish";
export type CollectorStageResult = {
  stage: CollectorStage;
  status: "SUCCESS" | "SKIPPED" | "FAILED" | "PENDING";
  source?: string;
  documentId?: string;
  concursoId?: string;
  errorCode?: string;
  durationMs: number;
};

export type CollectorMetrics = {
  sources_checked: number;
  sources_success: number;
  sources_failed: number;
  documents_found: number;
  documents_new: number;
  documents_updated: number;
  documents_unchanged: number;
  parsed_success: number;
  parse_failed: number;
  ai_requests: number;
  ai_success: number;
  ai_invalid_schema: number;
  ai_pending: number;
  concursos_created: number;
  concursos_updated: number;
  concursos_conflicted: number;
  concursos_publishable: number;
  duplicate_candidates: number;
  errors_count: number;
};

export const createCollectorMetrics = (): CollectorMetrics => ({
  sources_checked: 0, sources_success: 0, sources_failed: 0,
  documents_found: 0, documents_new: 0, documents_updated: 0, documents_unchanged: 0,
  parsed_success: 0, parse_failed: 0,
  ai_requests: 0, ai_success: 0, ai_invalid_schema: 0, ai_pending: 0,
  concursos_created: 0, concursos_updated: 0, concursos_conflicted: 0,
  concursos_publishable: 0, duplicate_candidates: 0, errors_count: 0,
});

export function stageResult(stage: CollectorStage, startedAt: number, details: Omit<CollectorStageResult, "stage" | "durationMs">): CollectorStageResult {
  return { stage, durationMs: Math.max(0, Date.now() - startedAt), ...details };
}

export function deriveCollectorRunStatus(metrics: CollectorMetrics): "SUCCESS" | "DEGRADED_NO_AI" | "FAILED" {
  if (metrics.sources_checked > 0 && metrics.sources_failed === metrics.sources_checked) return "FAILED";
  if (metrics.errors_count > 0 || metrics.sources_failed > 0 || metrics.parse_failed > 0 || metrics.ai_pending > 0) return "DEGRADED_NO_AI";
  return "SUCCESS";
}
