import { NextResponse } from "next/server";
import { extractPdfText } from "@/lib/collector/http";
import { syncConcursoFromDocument } from "@/lib/collector/syncConcurso";
import { valueHash } from "@/lib/collector/enrichment";
import { persistIdentityAliases } from "@/lib/collector/identityAliases";
import { supabaseService } from "@/lib/supabase-server";

const PROJECT_REF = "ukwulespvvthyjqgrjfo";
const ORIGINAL_URL = "https://conhecimento.fgv.br/concursos/pms2026";
const RETIFICATION_URL = "https://conhecimento.fgv.br/sites/default/files/concursos/3-retificacao-do-edital-n-01-de-2026.pdf";
const RETIFICATION_TITLE = "3ª Retificação do Edital nº 01 de 2026 - Prefeitura Municipal do Salvador";

type Contest = { id: string; quality_status: string | null };

function authorized(req: Request) {
  const expected = process.env.E2E_14_SECRET || "";
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || received.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  if (mismatch !== 0) return false;
  return true;
}

async function getCounts(svc: ReturnType<typeof supabaseService>, concursoId: string) {
  const [{ data: aliases }, { data: documents }, { data: changes }] = await Promise.all([
    svc.from("concurso_identity_aliases").select("alias_type,alias_value,source_url").eq("concurso_id", concursoId).eq("is_current", true),
    svc.from("concurso_documents").select("collector_document_id,relationship_type,source_url").eq("concurso_id", concursoId),
    svc.from("concurso_changes").select("field_name,new_value,relationship_type,source_url").eq("concurso_id", concursoId).eq("relationship_type", "RETIFICATION"),
  ]);
  return { aliases: aliases || [], documents: documents || [], changes: changes || [] };
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (process.env.E2E_14_ENABLED !== "true" || process.env.VERCEL_ENV !== "production" || new URL(supabaseUrl).hostname !== `${PROJECT_REF}.supabase.co`) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const svc = supabaseService();
    const { data: before, error: beforeError } = await svc.from("concursos").select("id,quality_status").eq("edital_url", ORIGINAL_URL).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw new Error("authorized E2E requires the original contest to exist");
    const contestBefore = before as Contest;

    const pdfResponse = await fetch(RETIFICATION_URL);
    if (!pdfResponse.ok) throw new Error(`retification fetch failed: ${pdfResponse.status}`);
    const parsedPdf = await extractPdfText(Buffer.from(await pdfResponse.arrayBuffer()));
    const { data: existingDocument, error: existingDocumentError } = await svc.from("collector_documents").select("id").eq("canonical_url", RETIFICATION_URL).maybeSingle();
    if (existingDocumentError) throw existingDocumentError;
    let documentId = existingDocument?.id || null;
    if (!documentId) {
      const { data: inserted, error } = await svc.from("collector_documents").insert({ source_url: RETIFICATION_URL, canonical_url: RETIFICATION_URL, document_type: "RETIFICATION", title: RETIFICATION_TITLE, content_hash: valueHash(RETIFICATION_URL), raw_text: parsedPdf.text || null, status: "PROCESSED", metadata: { e2e_14: true, parse_status: parsedPdf.status, source_name: "FGV", tier: 1 } }).select("id").single();
      if (error || !inserted) throw new Error(`persist E2E collector document: ${error?.message || "missing id"}`);
      documentId = inserted.id;
    }

    const input = { title: RETIFICATION_TITLE, canonicalUrl: RETIFICATION_URL, sourceName: "FGV", rawText: parsedPdf.text, documentId, documentType: "RETIFICATION" };
    const extracted = { orgao: "Prefeitura Municipal do Salvador", banca: "FGV", vagas: null, status: null, evidence: {} } as const;
    await persistIdentityAliases(svc, contestBefore.id, [{ alias_type: "EDITAL", alias_value: "01/2026", source_name: "FGV", source_url: RETIFICATION_URL, confidence: 0.95 }]);
    await syncConcursoFromDocument(svc, input, extracted, 1);
    const firstCounts = await getCounts(svc, contestBefore.id);
    await syncConcursoFromDocument(svc, input, extracted, 1);
    const secondCounts = await getCounts(svc, contestBefore.id);
    const { data: allRelatedDocuments } = await svc.from("concurso_documents").select("concurso_id,collector_document_id,relationship_type,source_url").eq("source_url", RETIFICATION_URL);
    const { data: after, error: afterError } = await svc.from("concursos").select("id,quality_status").eq("id", contestBefore.id).maybeSingle();
    if (afterError || !after) throw afterError || new Error("contest disappeared after E2E");
    const contestAfter = after as Contest;
    const detailResponse = await fetch(new URL(`/api/concursos/${contestAfter.id}`, req.url));
    const detail = await detailResponse.json() as { data?: { identity_aliases?: unknown[]; documents?: unknown[]; evidence?: unknown[]; raw_text?: unknown } };
    const idempotent = secondCounts.aliases.length === firstCounts.aliases.length && secondCounts.documents.length === firstCounts.documents.length && secondCounts.changes.length === firstCounts.changes.length;
    const sameEntity = contestBefore.id === contestAfter.id;
    const hasRetification = secondCounts.documents.some((row) => row.relationship_type === "RETIFICATION");
    const apiHasRawText = detail.data?.raw_text !== undefined;
    if (!sameEntity || !hasRetification || contestAfter.quality_status === "CONFLICTED" || !idempotent || apiHasRawText) return NextResponse.json({ ok: false, error: "persistent E2E assertions failed", diagnostics: { sameEntity, hasRetification, qualityStatus: contestAfter.quality_status, idempotent, apiStatus: detailResponse.status, apiHasRawText, first: { aliases: firstCounts.aliases.length, documents: firstCounts.documents.length, changes: firstCounts.changes.length }, second: { aliases: secondCounts.aliases.length, documents: secondCounts.documents.length, changes: secondCounts.changes.length }, relatedDocuments: allRelatedDocuments || [] } }, { status: 500 });
    return NextResponse.json({ ok: true, projectRef: PROJECT_REF, concursoIdBefore: contestBefore.id, concursoIdAfter: contestAfter.id, sameEntity: contestBefore.id === contestAfter.id, relationship: "RETIFICATION", aliasCount: secondCounts.aliases.length, documentCount: secondCounts.documents.length, changeCount: secondCounts.changes.length, qualityStatus: contestAfter.quality_status, idempotent, apiDetail: { status: detailResponse.status, aliases: detail.data?.identity_aliases?.length || 0, documents: detail.data?.documents?.length || 0, evidence: detail.data?.evidence?.length || 0, raw_text: false } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "E2E_FAILED" }, { status: 500 });
  }
}
