import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestIdentity } from "./entityResolution";
import { resolveCanonicalContestIds } from "./canonicalContest";

export type AliasType = "EDITAL" | "PROCESS" | "OFFICIAL_SLUG" | "OFFICIAL_URL" | "CARGO" | "CARGO_GROUP" | "EXTERNAL_ID";
export type IdentityAlias = { alias_type: AliasType; alias_value: string; source_name?: string | null; source_url?: string | null; confidence?: number };

export function normalizeBaseEditalNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const match = normalized.match(/\b(\d{1,3})\s*(?:\/|DE)\s*(20\d{2})\b/);
  return match ? `${match[1].padStart(2, "0")}/${match[2]}` : null;
}

export function aliasesFromIdentity(identity: ContestIdentity, sourceName?: string, sourceUrl?: string): IdentityAlias[] {
  const aliases: IdentityAlias[] = [];
  const add = (alias_type: AliasType, alias_value: string | null) => { if (alias_value) aliases.push({ alias_type, alias_value, source_name: sourceName || "", source_url: sourceUrl || null, confidence: 0.95 }); };
  add("EDITAL", normalizeBaseEditalNumber(identity.editalNumber));
  add("PROCESS", identity.processNumber);
  add("OFFICIAL_SLUG", identity.officialSlug);
  add("OFFICIAL_URL", sourceUrl || null);
  add("CARGO", identity.cargoKey);
  add("CARGO_GROUP", identity.cargoGroupKey);
  return aliases;
}

export function aliasesFromText(text: string, sourceName?: string, sourceUrl?: string): IdentityAlias[] {
  const aliases: IdentityAlias[] = [];
  const add = (alias_type: "EDITAL" | "PROCESS", alias_value: string | null) => { if (alias_value) aliases.push({ alias_type, alias_value, source_name: sourceName || "", source_url: sourceUrl || null, confidence: 0.9 }); };
  const editalMatches = [...text.matchAll(/EDITAL(?:\s+(?:N[ºO]\.?|NUMERO))?\s*([A-Z-]*\s*\d{1,3}\/20\d{2})/gi)];
  for (const match of editalMatches) add("EDITAL", normalizeBaseEditalNumber(match[1]));
  const processMatches = [...text.matchAll(/PROCESSO(?:\s+SELETIVO|\s+ADMINISTRATIVO)?\s*(?:N[ºO]\.?|NUMERO)?\s*([\d.]+\/20\d{2})/gi)];
  for (const match of processMatches) add("PROCESS", match[1].replace(/\s+/g, ""));
  return aliases;
}

export async function findAliasCandidates(svc: SupabaseClient, aliases: IdentityAlias[]) {
  const pairs = [...new Map(aliases.map((alias) => [`${alias.alias_type}:${alias.alias_value}`, alias])).values()];
  if (!pairs.length) return [] as { concurso_id: string; alias_type: AliasType; alias_value: string }[];
  const results: { concurso_id: string; alias_type: AliasType; alias_value: string }[] = [];
  for (const alias of pairs) {
    const { data, error } = await svc.from("concurso_identity_aliases").select("concurso_id,alias_type,alias_value").eq("is_current", true).eq("alias_type", alias.alias_type).eq("alias_value", alias.alias_value);
    if (error) throw new Error(`load aliases: ${error.message}`);
    results.push(...((data || []) as { concurso_id: string; alias_type: AliasType; alias_value: string }[]));
  }
  return results;
}

export async function findCanonicalAliasContestIds(svc: SupabaseClient, aliases: IdentityAlias[]) {
  const rows = await findAliasCandidates(svc, aliases);
  return resolveCanonicalContestIds(svc, rows.map((row) => row.concurso_id));
}

export async function persistIdentityAliases(svc: SupabaseClient, concursoId: string, aliases: IdentityAlias[]) {
  for (const alias of aliases) {
    const { error } = await svc.from("concurso_identity_aliases").upsert({ ...alias, concurso_id: concursoId, source_name: alias.source_name || "", confidence: alias.confidence ?? 0.95, is_current: true }, { onConflict: "concurso_id,alias_type,alias_value,source_name" });
    if (error) throw new Error(`persist identity alias: ${error.message}`);
  }
}
