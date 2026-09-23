import { supabaseService } from "@/lib/supabase-server";
import { adapters } from "./adapters";
import { safeFetch, hashContent, hashBuffer, extractPdfText } from "./http";
import type { DiscoveredDocument } from "./types";
import { isSafeUrl } from "./security";
import { ExtractConcursoSchema } from "./schemas";
import { syncConcursoFromDocument } from "./syncConcurso";
import { recalculateHotScores } from "./recalculateHotScores";
import { deterministicIdentity, enrichDocument } from "./enrichment";
import { validateContestPage } from "./contestPageValidator";
import { extractConcursoWithAI } from "./extractConcursoWithAI";

const MAX_AI_PER_RUN = Number(process.env.MAX_AI_REQUESTS_PER_RUN || 30);

export async function runCollector(externalRunId?: string): Promise<{ runId: string; status: string; stats: { sourcesChecked: number; documentsFound: number; documentsNew: number; documentsUpdated: number; aiPending: number } }> {
  if (process.env.COLLECTOR_ENABLED === "false") return { runId: externalRunId || "", status: "DISABLED", stats: { sourcesChecked: 0, documentsFound: 0, documentsNew: 0, documentsUpdated: 0, aiPending: 0 } };
  const svc = supabaseService();
  let runId = externalRunId || "";
  if (!runId) {
    const { data: run, error: runErr } = await svc.from("collector_runs").insert({ status: "RUNNING" }).select("id").single();
    if (runErr || !run?.id) throw new Error(`collector_runs insert failed: ${runErr?.message}`);
    runId = run.id as string;
  } else {
    const { error: runErr } = await svc.from("collector_runs").insert({ id: runId, status: "RUNNING" });
    if (runErr) throw new Error(`collector_runs insert failed: ${runErr.message}`);
  }
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
        let binaryHash: string | null = null;
        let textHash: string | null = null;
        let docType = doc.documentType;
        if (fetched.buffer) {
          binaryHash = hashBuffer(fetched.buffer);
          const pdfRes = await extractPdfText(fetched.buffer);
          if (pdfRes.status === "PARSE_FAILED_NO_TEXT") {
            contentHash = binaryHash;
            textHash = null;
            if (existing && existing.content_hash === contentHash) continue;
            const metadata = { source_name: doc.sourceName, tier: doc.tier, document_type: "EDITAL_PDF", pdf_status: pdfRes.status };
            if (existing) {
              await svc.from("collector_document_versions").insert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata });
              const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: "", status: "FAILED", metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
              if (updErr) errors++; else documentsUpdated++;
            } else {
              const sourceId = sourceMap.get(doc.sourceName)?.id;
              const { error: insErr } = await svc.from("collector_documents").insert({ source_id: sourceId, source_url: doc.sourceUrl, canonical_url: doc.canonicalUrl, document_type: "EDITAL_PDF", title: doc.title, content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: "", status: "FAILED", metadata });
              if (insErr) errors++; else documentsNew++;
            }
            continue;
          }
          raw = pdfRes.text;
          docType = "EDITAL_PDF";
          textHash = hashContent(raw.slice(0, 50000));
          contentHash = textHash;
        } else {
          textHash = hashContent(raw.slice(0, 50000));
          contentHash = textHash;
        }
        const page = validateContestPage(doc.title, doc.canonicalUrl, raw);
        if (page.decision === "REJECT") {
          if (existing) await svc.from("collector_documents").update({ metadata: { ...(existing.metadata || {}), page_validation: page }, status: "FETCHED" }).eq("id", existing.id);
          continue;
        }
        if (existing && existing.content_hash === contentHash) continue;

        const metadata: Record<string, unknown> = { source_name: doc.sourceName, source_url: doc.sourceUrl, tier: doc.tier, document_type: docType, page_validation: page, confidence: doc.tier === 1 ? 0.95 : 0.7 };
        const vagasMatch = raw.match(/(\d{1,5})\s+vagas/i);
        const salarioMatch = raw.match(/R\$\s*([\d\.\,]+)/);
        if (vagasMatch) metadata.vagas_hint = vagasMatch[1];
        if (salarioMatch) metadata.salario_hint = salarioMatch[1];

        let status = "FETCHED";
        if (page.decision === "MAYBE") {
          status = "FETCHED";
        } else if (aiProcessed < MAX_AI_PER_RUN) {
          const aiRes = await extractConcursoWithAI(doc.title, raw);
          if (aiRes.ok && aiRes.data) {
            const parsed = ExtractConcursoSchema.safeParse(aiRes.data);
            if (parsed.success) {
              metadata.ai_extracted = parsed.data;
              metadata.ai_provider = aiRes.provider;
              metadata.ai_model = aiRes.model;
              status = "PROCESSED";
              aiProcessed++;
              try { await syncConcursoFromDocument(svc, { ...doc, rawText: raw }, parsed.data, doc.tier); } catch (e) {
                errors++;
                const msg = e instanceof Error ? e.message : "ERR";
                metadata.sync_error = msg;
                // don't mark PROCESSED if sync failed
                if (msg.includes("upsert")) status = "AI_PENDING";
              }
            } else {
              status = "AI_PENDING";
              aiPending++;
            }
          } else if (aiRes.errorCode === "BUDGET_EXCEEDED" || aiRes.degraded) {
            const identity = deterministicIdentity(doc.title, doc.sourceName);
            const facts = enrichDocument(doc.title, raw);
            if (identity.orgao && identity.banca) {
              try { await syncConcursoFromDocument(svc, { ...doc, rawText: raw }, { orgao: identity.orgao, banca: identity.banca, vagas: facts.vagas, salario: facts.salario, inscricao_inicio: facts.inscricao_inicio, inscricao_fim: facts.inscricao_fim, prova_data: facts.prova_data, cadastro_reserva: facts.cadastro_reserva, cargos: facts.cargos, escolaridade: facts.escolaridade as ("FUNDAMENTAL" | "MEDIO" | "TECNICO" | "SUPERIOR")[], scope: facts.scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "REGIONAL" | null, state_code: facts.state_code, city: facts.city, status: null, evidence: {} }, doc.tier); } catch { errors++; }
            }
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
          const { error: verErr } = await svc.from("collector_document_versions").insert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata });
          if (verErr) errors++;
          const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: raw.slice(0, 20000), status, metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
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
            binary_hash: binaryHash,
            text_hash: textHash,
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

    await recalculateHotScores(svc);
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
