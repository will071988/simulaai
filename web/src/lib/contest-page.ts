import { cache } from "react";
import { resolveRequestedContest } from "@/lib/collector/canonicalContest";
import { supabaseService } from "@/lib/supabase-server";

export type ContestEvidence = { field_name: string; value_json: unknown; source_url: string; source_name: string | null; source_tier: number; evidence_text: string; confidence: number; observed_at: string };
export type ContestDocument = { document_type: string | null; relationship_type: string; source_url: string; source_name: string | null; published_at: string | null; observed_at: string; is_current: boolean };
export type ContestPageData = {
  id: string; requested_id: string; titulo: string; orgao: string; banca: string | null;
  vagas: number | null; salario: number | null; inscricao_inicio: string | null; inscricao_fim: string | null;
  prova_data: string | null; cargos: string[]; escolaridade: string[]; status: string | null;
  scope: string | null; state_code: string | null; city: string | null; latitude: number | null;
  longitude: number | null; location_label: string | null; quality_status: string; edital_url: string | null;
  edital_number: string | null; official_source: string | null; updated_at: string; simulado_slug: string | null;
  evidence: ContestEvidence[]; documents: ContestDocument[];
};

export const getContestPageData = cache(async (requestedId: string): Promise<ContestPageData | null> => {
  const svc = supabaseService();
  const resolved = await resolveRequestedContest(svc, requestedId);
  if (!resolved) return null;
  const contestResult = await svc.from("concursos").select("id,titulo,orgao,banca,vagas,salario,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,status,scope,state_code,city,latitude,longitude,location_label,quality_status,edital_url,edital_number,official_source,updated_at,is_publishable,simulados(slug)").eq("id", resolved.canonicalId).maybeSingle();
  if (contestResult.error) throw new Error("CONTEST_PAGE_QUERY_FAILED");
  if (!contestResult.data?.is_publishable) return null;
  const [evidenceResult, documentsResult] = await Promise.all([
    svc.from("concurso_field_evidence").select("field_name,value_json,source_url,source_name,source_tier,evidence_text,confidence,observed_at").eq("concurso_id", resolved.canonicalId).order("observed_at", { ascending: false }).limit(100),
    svc.from("concurso_documents").select("document_type,relationship_type,source_url,source_name,published_at,observed_at,is_current").eq("concurso_id", resolved.canonicalId).order("observed_at", { ascending: false }).limit(100),
  ]);
  if (evidenceResult.error || documentsResult.error) throw new Error("CONTEST_PAGE_PROVENANCE_QUERY_FAILED");
  const { simulados, is_publishable: _isPublishable, ...contest } = contestResult.data;
  void _isPublishable;
  return {
    ...contest, id: resolved.canonicalId, requested_id: requestedId,
    cargos: Array.isArray(contest.cargos) ? contest.cargos.map(String) : [],
    escolaridade: Array.isArray(contest.escolaridade) ? contest.escolaridade.map(String) : [],
    simulado_slug: Array.isArray(simulados) ? simulados[0]?.slug || null : null,
    evidence: (evidenceResult.data || []) as ContestEvidence[], documents: (documentsResult.data || []) as ContestDocument[],
  } as ContestPageData;
});
