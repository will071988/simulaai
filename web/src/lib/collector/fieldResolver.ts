export type FieldEvidence = { value_json: unknown; source_tier: number; observed_at: string; source_url: string; evidence_text?: string };
export type FieldDecision = "ACCEPT_NEW" | "KEEP_CURRENT" | "CONFLICT";

export function resolveField(currentValue: unknown, incomingValue: unknown, incoming: { tier: number; observedAt: string; isAmendment?: boolean }, existing: FieldEvidence[]) {
  if (incomingValue == null) return { resolvedValue: currentValue, decision: "KEEP_CURRENT" as FieldDecision, conflict: false, winningEvidence: null };
  const same = existing.find((e) => JSON.stringify(e.value_json) === JSON.stringify(incomingValue));
  if (same) return { resolvedValue: incomingValue, decision: "ACCEPT_NEW" as FieldDecision, conflict: false, winningEvidence: same };
  const winner = [...existing].sort((a, b) => a.source_tier - b.source_tier || Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
  if (!winner || currentValue == null) return { resolvedValue: incomingValue, decision: "ACCEPT_NEW" as FieldDecision, conflict: false, winningEvidence: null };
  if (incoming.tier > winner.source_tier) return { resolvedValue: currentValue, decision: "KEEP_CURRENT" as FieldDecision, conflict: true, winningEvidence: winner };
  if (incoming.tier < winner.source_tier) return { resolvedValue: incomingValue, decision: "ACCEPT_NEW" as FieldDecision, conflict: JSON.stringify(winner.value_json) !== JSON.stringify(incomingValue), winningEvidence: null };
  if (incoming.isAmendment && Date.parse(incoming.observedAt) > Date.parse(winner.observed_at)) return { resolvedValue: incomingValue, decision: "ACCEPT_NEW" as FieldDecision, conflict: true, winningEvidence: null };
  return { resolvedValue: currentValue, decision: "CONFLICT" as FieldDecision, conflict: JSON.stringify(winner.value_json) !== JSON.stringify(incomingValue), winningEvidence: winner };
}
