import type { SupabaseClient } from "@supabase/supabase-js";

export type CanonicalLink = { id: string; merged_into_id: string | null };
export type RequestedContest = {
  requestedId: string;
  canonicalId: string;
  isMerged: boolean;
  mergedIntoId: string | null;
};

export function resolveCanonicalId(id: string, links: CanonicalLink[]): string {
  const mapping = new Map(links.map((link) => [link.id, link.merged_into_id]));
  const seen = new Set<string>();
  let current = id;
  while (mapping.get(current)) {
    if (seen.has(current)) throw new Error(`canonical contest cycle detected at ${current}`);
    seen.add(current);
    current = mapping.get(current) as string;
  }
  if (seen.has(current)) throw new Error(`canonical contest cycle detected at ${current}`);
  return current;
}

export function resolveCanonicalIds(ids: string[], links: CanonicalLink[]): string[] {
  return [...new Set(ids.map((id) => resolveCanonicalId(id, links)))];
}

export async function resolveCanonicalContestId(svc: SupabaseClient, id: string): Promise<string> {
  let current = id;
  const seen = new Set<string>();
  for (let depth = 0; depth < 50; depth++) {
    if (seen.has(current)) throw new Error(`canonical contest cycle detected at ${current}`);
    seen.add(current);
    const { data, error } = await svc.from("concursos").select("id,merged_into_id").eq("id", current).maybeSingle();
    if (error) throw new Error(`resolve canonical contest: ${error.message}`);
    if (!data) throw new Error(`canonical contest not found: ${current}`);
    if (!data.merged_into_id) return current;
    current = data.merged_into_id;
  }
  throw new Error(`canonical contest chain exceeds 50 links from ${id}`);
}

/**
 * Resolve legacy IDs once at the API boundary. Consumers should persist canonicalId,
 * while requestedId remains useful only for compatibility and diagnostics.
 */
export async function resolveRequestedContest(svc: SupabaseClient, requestedId: string): Promise<RequestedContest | null> {
  const { data: requested, error: requestedError } = await svc.from("concursos").select("id,merged_into_id").eq("id", requestedId).maybeSingle();
  if (requestedError) throw new Error(`load requested contest: ${requestedError.message}`);
  if (!requested) return null;
  const canonicalId = await resolveCanonicalContestId(svc, requestedId);
  return {
    requestedId,
    canonicalId,
    isMerged: requested.merged_into_id != null,
    mergedIntoId: requested.merged_into_id || null,
  };
}

export async function resolveCanonicalContestIds(svc: SupabaseClient, ids: string[]): Promise<string[]> {
  const resolved = [];
  for (const id of [...new Set(ids)]) resolved.push(await resolveCanonicalContestId(svc, id));
  return [...new Set(resolved)];
}
