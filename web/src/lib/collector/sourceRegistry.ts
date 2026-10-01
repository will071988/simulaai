export const SOURCE_HEALTH_STATUSES = ["HEALTHY", "DEGRADED", "FAILED", "DISABLED"] as const;
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number];

export type SourceRegistryEntry = {
  enabled: boolean;
  tier: number;
  failureCount: number;
  lastStatus?: string | null;
  adapter?: string | null;
};

export function sourcePriority(tier: number): number {
  if (tier === 1) return 300;
  if (tier === 2) return 200;
  if (tier === 3) return 100;
  return 0;
}

export function deriveSourceHealth(source: SourceRegistryEntry, failureThreshold = 3): SourceHealthStatus {
  if (!source.enabled) return "DISABLED";
  if (!source.adapter) return "FAILED";
  if (source.failureCount >= failureThreshold) return "DEGRADED";
  if (["FAILED", "DEGRADED", "EMPTY"].includes(source.lastStatus || "")) return "DEGRADED";
  return "HEALTHY";
}

export function mayActivateCandidate(candidate: {
  status: string;
  reviewedBy?: string | null;
  officialUrl?: string | null;
}): boolean {
  if (candidate.status !== "APPROVED" || !candidate.reviewedBy || !candidate.officialUrl) return false;
  try {
    const url = new URL(candidate.officialUrl);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function mayProvideFactualAuthority(tier: number, sourceType: string): boolean {
  return tier === 1 && ["ORGAO_OFICIAL", "BANCA", "DIARIO_OFICIAL"].includes(sourceType);
}
