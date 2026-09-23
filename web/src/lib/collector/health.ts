type HealthInput = {
  lastRun?: { status?: string | null } | null;
  sourcesHealthy: number;
  sourcesDegraded: number;
  pendingAI: number;
};

export function deriveCollectorHealth(input: HealthInput): "HEALTHY" | "DEGRADED" | "FAILED" {
  if (input.lastRun?.status === "FAILED" || (input.sourcesHealthy === 0 && input.sourcesDegraded > 0)) return "FAILED";
  if (input.pendingAI > 0 || input.sourcesDegraded > 0 || input.lastRun?.status === "DEGRADED_NO_AI") return "DEGRADED";
  return "HEALTHY";
}
