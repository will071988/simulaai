export type PublicationContest = {
  orgao?: string | null;
  titulo?: string | null;
  edital_url?: string | null;
  quality_status?: string | null;
  merged_into_id?: string | null;
  logical_key?: string | null;
  edital_number?: string | null;
  process_number?: string | null;
  official_slug?: string | null;
  officialEvidenceCount?: number;
  hasOfficialDocument?: boolean;
};

export type PublicationDecision = {
  publishable: boolean;
  reasons: string[];
  missingRequiredFields: string[];
  blockedByConflict: boolean;
};

export function evaluatePublicationState(contest: PublicationContest): PublicationDecision {
  const reasons: string[] = [];
  const missingRequiredFields: string[] = [];
  const blockedByConflict = contest.quality_status === "CONFLICTED";

  if (!contest.orgao?.trim()) missingRequiredFields.push("orgao");
  if (!contest.titulo?.trim()) missingRequiredFields.push("titulo");
  if (!contest.edital_url?.trim() && !contest.hasOfficialDocument) missingRequiredFields.push("official_document");

  const identitySufficient = Boolean(
    contest.edital_number || contest.process_number || contest.official_slug,
  );
  if (!identitySufficient) missingRequiredFields.push("identity");
  if ((contest.officialEvidenceCount || 0) < 1) missingRequiredFields.push("official_evidence");

  if (contest.merged_into_id) reasons.push("MERGED_ENTITY");
  if (blockedByConflict) reasons.push("CONFLICTED");
  if (contest.quality_status === "AI_PENDING") reasons.push("AI_PENDING");
  if (contest.quality_status === "FAILED") reasons.push("FAILED");
  if (!contest.quality_status || !["VERIFIED", "PARTIAL"].includes(contest.quality_status)) reasons.push("QUALITY_NOT_PUBLISHABLE");
  if (missingRequiredFields.length) reasons.push("MISSING_REQUIRED_FIELDS");

  const publishable = reasons.length === 0;
  return { publishable, reasons: publishable ? ["PUBLISHABLE"] : reasons, missingRequiredFields, blockedByConflict };
}

export const isPublishableContest = (contest: PublicationContest) => evaluatePublicationState(contest).publishable;

export function deriveQualityStatus(input: { current?: string | null; conflicted: boolean; sourceTier: number; officialEvidenceCount: number }) {
  if (input.conflicted || input.current === "CONFLICTED") return "CONFLICTED" as const;
  if (input.current === "VERIFIED") return "VERIFIED" as const;
  return input.sourceTier === 1 && input.officialEvidenceCount >= 3 ? "VERIFIED" as const : "PARTIAL" as const;
}
