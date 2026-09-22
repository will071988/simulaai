import { supabaseService } from "@/lib/supabase-server";
import { adapters } from "./adapters";
import { safeFetch, hashContent, hashBuffer, extractPdfText } from "./http";
import { generateWithFallback } from "@/lib/ai/router";
import type { DiscoveredDocument } from "./types";
import { isSafeUrl } from "./security";
import { z } from "zod";

const MAX_AI_PER_RUN = Number(process.env.MAX_AI_REQUESTS_PER_RUN || 30);

const ExtractSchema = z.object({
  orgao: z.string().nullable().transform((v) => v?.slice(0, 100) || null),
  banca: z.string().nullable().transform((v) => v?.slice(0, 50) || null),
  vagas: z.number().nullable(),
  status: z.string().nullable().transform((v) => v?.slice(0, 30) || null),
  evidence: z.object({ orgao: z.string().optional(), banca: z.string().optional(), vagas: z.string().optional(), status: z.string().optional() }).optional(),
});

function normalizeOrgao(v: string | null): string | null {
  if (!v) return null;
  const m: Record<string, string> = { "POLICIA FEDERAL": "PF", "POLÍCIA FEDERAL": "PF", "PRF": "PRF", "PC-BA": "PC-BA" };
  const up = v.trim().toUpperCase();
  return m[up] || v.trim().slice(0, 80);
}
function normalizeBanca(v: string | null): string | null {
  if (!v) return null;
  const low = v.trim().toLowerCase();
  if (low.includes("cebraspe")) return "Cebraspe";
  if (low.includes("fgv")) return "FGV";
  if (low.includes("aocp")) return "Instituto AOCP";
  if (low.includes("cesgranrio")) return "Cesgranrio";
  if (low.includes("fcc")) return "FCC";
  return v.trim().slice(0, 50);
}

async function syncConcursoFromDocument(svc: ReturnType<typeof supabaseService>, doc: DiscoveredDocument, extracted: z.infer<typeof ExtractSchema>, tier: number) {
  // tier2 não publica automaticamente como fato confirmado
  if (tier === 2 && !extracted.orgao) return;
  const orgao = normalizeOrgao(extracted.orgao);
  const banca = normalizeBanca(extracted.banca);
  if (!orgao || !banca) return;
  const confidence = tier === 1 ? 0.95 : 0.7;
  const { error } = await svc.from("concursos").upsert({ orgao, titulo: doc.title.slice(0, 200), banca, vagas: extracted.vagas, status: extracted.status || "previsto", edital_url: doc.canonicalUrl }, { onConflict: "edital_url" });
  if (error) throw new Error(`syncConcurso upsert: ${error.message}`);
  // store confidence in metadata later
  return confidence;
}

export async function runCollector(): Promise<{ runId: string; status: string; stats: { sourcesChecked: number; documentsFound: number; documentsNew: number; documentsUpdated: number; aiPending: number } }> {
  if (process.env.COLLECTOR_ENABLED === "false") return { runId: "", status: "DISABLED", stats: { sourcesChecked: 0, documentsFound: 0, documentsNew: 0, documentsUpdated: 0, aiPending: 0 } };
  const svc = supabaseService();
  const { data: run, error: runErr } = await svc.from("collector_runs").insert({ status: "RUNNING" }).select("id").single();
  if (runErr || !run?.id) throw new Error(`collector_runs insert failed: ${runErr?.message}`);
  const runId = run.id as string;
  let sourcesChecked = 0, documentsFound = 0, documentsNew = 0, documentsUpdated = 0, aiPending = 0, aiProcessed = 0, errors = 0;

  try {
    const { data: sources, error: srcErr } = await svc.from("collector_sources").select("*").eq("enabled", true);
    if (srcErr) throw new Error(`load sources: ${srcErr.message}`);
    const sourceMap = new Map((sources || []).map((s) => [s.name, s]));

    for (const adapter of adapters) {
      sourcesChecked++;
      await new Promise((r) => setTimeout(r, 800));
      let discovered: DiscoveredDocument[] = [];
      let lastStatus = "SUCCESS";
      let lastError: string | null = null;
      try {
        discovered = await adapter.discover();
        if (discovered.length === 0) lastStatus = "EMPTY";
      } catch (e) {
        errors++;
        lastStatus = "FAILED";
        lastError = e instanceof Error ? e.message : "ERR";
        const prev = sourceMap.get(adapter.sourceName);
        const { error: updErr } = await svc.from("collector_sources").update({ last_failure_at: new Date().toISOString(), failure_count: (prev?.failure_count || 0) + 1, last_status: lastStatus, last_error_code: lastError, last_documents_count: 0 }).eq("name", adapter.sourceName);
        if (updErr) errors++;
        continue;
      }
      const prev = sourceMap.get(adapter.sourceName);
      const emptyStreak = discovered.length === 0 ? (prev?.consecutive_empty_runs || 0) + 1 : 0;
      const healthStatus = discovered.length === 0 && emptyStreak >= 3 ? "DEGRADED" : lastStatus;
      const { error: updErr2 } = await svc.from("collector_sources").update({ last_success_at: new Date().toISOString(), failure_count: 0, last_status: healthStatus, last_documents_count: discovered.length, last_document_found_at: discovered.length ? new Date().toISOString() : prev?.last_document_found_at, consecutive_empty_runs: emptyStreak, last_error_code: null }).eq("name", adapter.sourceName);
      if (updErr2) errors++;
      documentsFound += discovered.length;

      for (const doc of discovered) {
        if (!isSafeUrl(doc.canonicalUrl)) { errors++; continue; }
        const { data: existing, error: selErr } = await svc.from("collector_documents").select("id, content_hash, raw_text, metadata").eq("canonical_url", doc.canonicalUrl).limit(1).maybeSingle();
        if (selErr) { errors++; continue; }
        const fetched = await safeFetch(doc.canonicalUrl, { allowedTypes: ["text/html", "application/pdf"] });
        if (!fetched.ok) { errors++; continue; }
        let raw = fetched.text || "";
        let contentHash: string;
        let docType = doc.documentType;
        if (fetched.buffer) {
          // PDF pipeline
          const pdfRes = await extractPdfText(fetched.buffer);
          if (pdfRes.status === "PARSE_FAILED_NO_TEXT") {
            // mark as OCR_REQUIRED
            contentHash = hashBuffer(fetched.buffer);
            if (existing && existing.content_hash === contentHash) continue;
            const metadata = { source_name: doc.sourceName, tier: doc.tier, document_type: "EDITAL_PDF", pdf_status: pdfRes.status };
            if (existing) {
              await svc.from("collector_document_versions").insert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata });
              const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, raw_text: "", status: "FAILED", metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
              if (updErr) errors++; else documentsUpdated++;
            } else {
              const sourceId = sourceMap.get(doc.sourceName)?.id;
              const { error: insErr } = await svc.from("collector_documents").insert({ source_id: sourceId, source_url: doc.sourceUrl, canonical_url: doc.canonicalUrl, document_type: "EDITAL_PDF", title: doc.title, content_hash: contentHash, raw_text: "", status: "FAILED", metadata });
              if (insErr) errors++; else documentsNew++;
            }
            continue;
          }
          raw = pdfRes.text;
          docType = "EDITAL_PDF";
          contentHash = hashContent(raw.slice(0, 50000));
        } else {
          contentHash = hashContent(raw.slice(0, 50000));
        }
        if (existing && existing.content_hash === contentHash) continue;

        const metadata: Record<string, unknown> = { source_name: doc.sourceName, source_url: doc.sourceUrl, tier: doc.tier, document_type: docType, confidence: doc.tier === 1 ? 0.95 : 0.7 };
        const vagasMatch = raw.match(/(\d{1,5})\s+vagas/i);
        const salarioMatch = raw.match(/R\$\s*([\d\.\,]+)/);
        if (vagasMatch) metadata.vagas_hint = vagasMatch[1];
        if (salarioMatch) metadata.salario_hint = salarioMatch[1];

        let status = "FETCHED";
        if (aiProcessed < MAX_AI_PER_RUN) {
          const aiRes = await generateWithFallback<{ orgao: string | null; banca: string | null; vagas: number | null; status: string | null; evidence?: unknown }>({
            taskType: "EXTRACT_CONCURSO",
            prompt: `Extraia concurso. Retorne JSON {orgao,banca,vagas,status,evidence:{orgao,banca,vagas,status}} com evidence trecho pequeno. Não invente. Se não houver, null. Prompt v1.`,
            input: { title: doc.title, snippet: raw.slice(0, 4000) },
            promptVersion: "extract_concurso_v1",
          }, { validate: (d) => ExtractSchema.safeParse(d).success });
          if (aiRes.ok && aiRes.data) {
            const parsed = ExtractSchema.safeParse(aiRes.data);
            if (parsed.success) {
              metadata.ai_extracted = parsed.data;
              metadata.ai_provider = aiRes.provider;
              metadata.ai_model = aiRes.model;
              status = "PROCESSED";
              aiProcessed++;
              try { await syncConcursoFromDocument(svc, doc, parsed.data, doc.tier); } catch (e) { errors++; metadata.sync_error = e instanceof Error ? e.message : "ERR"; }
            } else {
              status = "AI_PENDING";
              aiPending++;
            }
          } else if (aiRes.errorCode === "BUDGET_EXCEEDED" || aiRes.degraded) {
            status = "AI_PENDING";
            aiPending++;
          } else {
            status = "AI_PENDING";
            aiPending++;
          }
        } else {
          status = "AI_PENDING";
          aiPending++;
        }

        if (existing) {
          // versioning: save old version
          const { error: verErr } = await svc.from("collector_document_versions").insert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata });
          if (verErr) errors++;
          const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, raw_text: raw.slice(0, 20000), status, metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
          if (updErr) errors++; else documentsUpdated++;
        } else {
          const sourceId = sourceMap.get(doc.sourceName)?.id;
          const { error: insErr } = await svc.from("collector_documents").insert({
            source_id: sourceId,
            source_url: doc.sourceUrl,
            canonical_url: doc.canonicalUrl,
            document_type: docType,
            title: doc.title,
            content_hash: contentHash,
            raw_text: raw.slice(0, 20000),
            status,
            metadata,
          });
          if (insErr) errors++; else documentsNew++;
        }

        // candidate discovery
        const urlRe = /https?:\/\/[^\s"'<>]+/g;
        let u: RegExpExecArray | null;
        let cand = 0;
        while ((u = urlRe.exec(raw)) && cand < 3) {
          const candUrl = u[0];
          if (!isSafeUrl(candUrl)) continue;
          if (candUrl.includes("concurso") || candUrl.includes("edital")) {
            const { error: candErr } = await svc.from("source_candidates").insert({ url: candUrl, domain: new URL(candUrl).hostname, reason: "discovered in document", found_by: doc.sourceName, confidence: 0.6 });
            if (candErr && !candErr.message.includes("duplicate")) errors++;
          }
          cand++;
        }
      }
    }

    const finalStatus = aiPending > 0 && aiProcessed === 0 ? "DEGRADED_NO_AI" : "SUCCESS";
    const { error: runUpdErr } = await svc.from("collector_runs").update({ finished_at: new Date().toISOString(), status: finalStatus, sources_checked: sourcesChecked, documents_found: documentsFound, documents_new: documentsNew, documents_updated: documentsUpdated, ai_processed: aiProcessed, ai_pending: aiPending, errors_count: errors }).eq("id", runId);
    if (runUpdErr) throw new Error(runUpdErr.message);
    return { runId, status: finalStatus, stats: { sourcesChecked, documentsFound, documentsNew, documentsUpdated, aiPending } };
  } catch (e) {
    const svc2 = supabaseService();
    await svc2.from("collector_runs").update({ finished_at: new Date().toISOString(), status: "FAILED", sources_checked: sourcesChecked, documents_found: documentsFound, documents_new: documentsNew, documents_updated: documentsUpdated, errors_count: errors + 1 }).eq("id", runId);
    throw e;
  }
}
