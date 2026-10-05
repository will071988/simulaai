type HealthInput = {
  lastRun?: { status?: string | null; started_at?: string | null; finished_at?: string | null; errors_count?: number | null; parse_failed?: number | null; parsed_success?: number | null } | null;
  sourcesHealthy: number;
  sourcesDegraded: number;
  sourcesFailed?: number;
  sourceFailureThresholdExceeded?: boolean;
  pendingAI: number;
  now?: number;
  maxPendingAI?: number;
  maxRunAgeMs?: number;
  maxParseFailureRate?: number;
};

export function deriveCollectorHealth(input: HealthInput): "HEALTHY" | "DEGRADED" | "FAILED" {
  if (!input.lastRun) return "DEGRADED";
  const now = input.now ?? Date.now();
  const sourcesFailed = input.sourcesFailed || 0;
  const totalSources = input.sourcesHealthy + input.sourcesDegraded + sourcesFailed;
  const runTimestamp = Date.parse(input.lastRun.finished_at || input.lastRun.started_at || "");
  const stale = !Number.isFinite(runTimestamp) || now - runTimestamp > (input.maxRunAgeMs ?? 26 * 60 * 60 * 1000);
  const parsed = input.lastRun.parsed_success || 0;
  const parseFailed = input.lastRun.parse_failed || 0;
  const parseFailureRate = parsed + parseFailed > 0 ? parseFailed / (parsed + parseFailed) : 0;
  if (totalSources === 0 || input.lastRun.status === "FAILED" || sourcesFailed === totalSources || input.sourceFailureThresholdExceeded) return "FAILED";
  if (input.lastRun.status === "RUNNING" && now - Date.parse(input.lastRun.started_at || "") > 20 * 60 * 1000) return "FAILED";
  if (stale || input.lastRun.status === "RUNNING" || (input.lastRun.errors_count || 0) > 0 || input.pendingAI > (input.maxPendingAI ?? 20) || sourcesFailed > 0 || input.sourcesDegraded > 0 || input.lastRun.status === "DEGRADED_NO_AI" || parseFailureRate > (input.maxParseFailureRate ?? 0.25)) return "DEGRADED";
  return "HEALTHY";
}
