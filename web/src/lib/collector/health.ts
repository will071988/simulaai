export type PendingHealthJob = { status?: string | null; started_at?: string | null; finished_at?: string | null; counters?: { claimed?: number; failed?: number } | null };
export function selectPendingHealthJob<T extends PendingHealthJob>(jobs: readonly T[]): T | null {
  return jobs.find((job) => ["RUNNING", "FAILED", "DEGRADED"].includes(job.status || "") || (job.status === "SUCCESS" && Number(job.counters?.claimed || 0) > 0)) || null;
}

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
  lastPendingJob?: PendingHealthJob | null;
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
  if (input.lastPendingJob !== undefined) {
    const job = input.lastPendingJob;
    const jobTime = Date.parse(job?.finished_at || job?.started_at || "");
    if (job && (["FAILED", "DEGRADED", "RUNNING"].includes(job.status || "") || Number(job.counters?.failed || 0) > 0)) return "DEGRADED";
    if (input.pendingAI > 0 && (!job || job.status !== "SUCCESS" || !Number.isFinite(jobTime) || now - jobTime > (input.maxRunAgeMs ?? 26 * 60 * 60 * 1000))) return "DEGRADED";
  }
  if (stale || input.lastRun.status === "RUNNING" || (input.lastRun.errors_count || 0) > 0 || input.pendingAI > (input.maxPendingAI ?? 20) || sourcesFailed > 0 || input.sourcesDegraded > 0 || input.lastRun.status === "DEGRADED_NO_AI" || parseFailureRate > (input.maxParseFailureRate ?? 0.25)) return "DEGRADED";
  return "HEALTHY";
}
