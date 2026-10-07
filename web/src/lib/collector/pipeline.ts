import { supabaseService } from "@/lib/supabase-server";
import { adapters } from "./adapters";
import { safeFetch, hashContent, hashBuffer, extractPdfText, checkRobots, stableHtmlText } from "./http";
import type { DiscoveredDocument } from "./types";
import { isSafeUrl } from "./security";
import { ExtractConcursoSchema, type ExtractConcurso } from "./schemas";
import { syncConcursoFromDocument } from "./syncConcurso";
import { recalculateHotScores } from "./recalculateHotScores";
import { deterministicIdentity, enrichDocument } from "./enrichment";
import { validateContestPage } from "./contestPageValidator";
import { extractConcursoWithAI } from "./extractConcursoWithAI";
import { createCollectorMetrics, deriveCollectorRunStatus, stageResult, type CollectorStageResult } from "./observability";
import { GenerationBudget } from "../ai/generationBudget";
import { deriveSourceHealth } from "./sourceRegistry";

const MAX_AI_PER_RUN = Number(process.env.MAX_AI_REQUESTS_PER_RUN || 10);
const MAX_DOCUMENTS_PER_RUN = Number(process.env.MAX_DOCUMENTS_PER_RUN || 10);
const MAX_DOCUMENTS_PER_SOURCE = Number(process.env.MAX_DOCUMENTS_PER_SOURCE || 2);

export async function runCollector(externalRunId?: string): Promise<{ runId: string; status: string; stats: Record<string, number> }> {
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
  let aiProcessed = 0;
  const metrics = createCollectorMetrics();
  const generationBudget = new GenerationBudget(MAX_AI_PER_RUN);
  const stages: CollectorStageResult[] = [];
  const recordStage = (result: CollectorStageResult) => { if (stages.length < 200) stages.push(result); };
  let documentsAttempted = 0;

  try {
    const { data: sources, error: srcErr } = await svc.from("collector_sources").select("*").eq("enabled", true);
    if (srcErr) throw new Error(`load sources: ${srcErr.message}`);
    const sourceMap = new Map((sources || []).map((s) => [s.name, s]));
    for (const source of sources || []) {
      if (adapters.some((adapter) => adapter.sourceName === source.name)) continue;
      metrics.sources_checked++;
      metrics.sources_failed++;
      metrics.errors_count++;
      const failureCount = (source.failure_count || 0) + 1;
      const { error } = await svc.from("collector_sources").update({ last_status: "FAILED", health_status: deriveSourceHealth({ enabled: true, tier: source.tier, failureCount, adapter: null }), last_checked_at: new Date().toISOString(), last_error_code: "ADAPTER_NOT_CONFIGURED", last_failure_at: new Date().toISOString(), failure_count: failureCount }).eq("id", source.id);
      if (error) throw new Error("SOURCE_STATUS_WRITE_FAILED");
      recordStage(stageResult("discover", Date.now(), { status: "FAILED", source: source.name, errorCode: "ADAPTER_NOT_CONFIGURED" }));
    }

    for (const adapter of adapters) {
      const configuredSource = sourceMap.get(adapter.sourceName);
      if (!configuredSource || configuredSource.enabled === false) continue;
      metrics.sources_checked++;
      await new Promise((r) => setTimeout(r, 800));
      let discovered: DiscoveredDocument[] = [];
      let lastStatus = "SUCCESS";
      let lastError: string | null = null;
      const discoverStarted = Date.now();
      try {
        discovered = await adapter.discover();
        if (discovered.length === 0) lastStatus = "EMPTY";
        metrics.sources_success++;
        recordStage(stageResult("discover", discoverStarted, { status: "SUCCESS", source: adapter.sourceName }));
      } catch (e) {
        metrics.errors_count++;
        metrics.sources_failed++;
        lastStatus = "FAILED";
        lastError = e instanceof Error ? e.message : "ERR";
        recordStage(stageResult("discover", discoverStarted, { status: "FAILED", source: adapter.sourceName, errorCode: lastError }));
        const prev = sourceMap.get(adapter.sourceName);
        const failureCount = (prev?.failure_count || 0) + 1;
        const { error: updErr } = await svc.from("collector_sources").update({ last_checked_at: new Date().toISOString(), last_failure_at: new Date().toISOString(), failure_count: failureCount, last_status: lastStatus, health_status: deriveSourceHealth({ enabled: true, tier: configuredSource.tier, failureCount, adapter: configuredSource.adapter || adapter.sourceName, lastStatus }), last_error_code: lastError, last_documents_count: 0 }).eq("name", adapter.sourceName);
        if (updErr) throw new Error("SOURCE_STATUS_WRITE_FAILED");
        continue;
      }
      const prev = sourceMap.get(adapter.sourceName);
      const emptyStreak = discovered.length === 0 ? (prev?.consecutive_empty_runs || 0) + 1 : 0;
      const healthStatus = discovered.length === 0 && emptyStreak >= 3 ? "DEGRADED" : lastStatus;
      const { error: updErr2 } = await svc.from("collector_sources").update({ last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), failure_count: 0, last_status: healthStatus, health_status: deriveSourceHealth({ enabled: true, tier: configuredSource.tier, failureCount: 0, adapter: configuredSource.adapter || adapter.sourceName, lastStatus: healthStatus }), last_documents_count: discovered.length, last_document_found_at: discovered.length ? new Date().toISOString() : prev?.last_document_found_at, consecutive_empty_runs: emptyStreak, last_error_code: null }).eq("name", adapter.sourceName);
      if (updErr2) throw new Error("SOURCE_STATUS_WRITE_FAILED");
      metrics.documents_found += discovered.length;

      const canonicalUrls = discovered.map((doc) => doc.canonicalUrl);
      const { data: knownDocuments, error: knownError } = canonicalUrls.length
        ? await svc.from("collector_documents").select("canonical_url,last_seen_at").in("canonical_url", canonicalUrls)
        : { data: [], error: null };
      if (knownError) throw new Error("DOCUMENT_PRIORITY_QUERY_FAILED");
      const knownByUrl = new Map((knownDocuments || []).map((doc) => [doc.canonical_url, doc.last_seen_at || ""]));
      const orderedDocuments = [...discovered].sort((a, b) => {
        const aSeen = knownByUrl.get(a.canonicalUrl);
        const bSeen = knownByUrl.get(b.canonicalUrl);
        if (aSeen === undefined) return bSeen === undefined ? 0 : -1;
        if (bSeen === undefined) return 1;
        return aSeen.localeCompare(bSeen);
      });
      let sourceAttempted = 0;
      for (const discoveredDoc of orderedDocuments) {
        if (sourceAttempted >= MAX_DOCUMENTS_PER_SOURCE) break;
        sourceAttempted++;
        if (configuredSource.tier !== 1 || discoveredDoc.metadata?.discoveryOnly) {
          const { error } = await svc.from("source_candidates").upsert({ url: discoveredDoc.canonicalUrl, domain: new URL(discoveredDoc.canonicalUrl).hostname, reason: "Secondary discovery; requires official confirmation", found_by: adapter.sourceName, confidence: 0.5 }, { onConflict: "url", ignoreDuplicates: true });
          if (error) throw new Error("DISCOVERY_CANDIDATE_WRITE_FAILED");
          continue;
        }
        if (documentsAttempted >= MAX_DOCUMENTS_PER_RUN) break;
        documentsAttempted++;
        const doc = { ...discoveredDoc, tier: configuredSource.tier, sourceId: configuredSource.id };
        if (!isSafeUrl(doc.canonicalUrl)) { metrics.errors_count++; continue; }
        const { data: existing, error: selErr } = await svc.from("collector_documents").select("id, content_hash, raw_text, metadata").eq("canonical_url", doc.canonicalUrl).limit(1).maybeSingle();
        if (selErr) { metrics.errors_count++; continue; }
        const fetchStarted = Date.now();
        const target = new URL(doc.canonicalUrl);
        const robots = await checkRobots(target.origin, `${target.pathname}${target.search}`);
        if (!robots.allowed) {
          metrics.errors_count++;
          recordStage(stageResult("fetch", fetchStarted, { status: "FAILED", source: doc.sourceName, documentId: existing?.id, errorCode: robots.status }));
          continue;
        }
        const fetched = await safeFetch(doc.canonicalUrl, { allowedTypes: ["text/html", "application/pdf"], allowedOrigin: adapter.documentOrigins || adapter.baseUrl });
        if (!fetched.ok) { metrics.errors_count++; recordStage(stageResult("fetch", fetchStarted, { status: "FAILED", source: doc.sourceName, documentId: existing?.id, errorCode: fetched.error || `HTTP_${fetched.status}` })); continue; }
        recordStage(stageResult("fetch", fetchStarted, { status: "SUCCESS", source: doc.sourceName, documentId: existing?.id }));
        const parseStarted = Date.now();
        let raw = fetched.text || "";
        let contentHash: string;
        let binaryHash: string | null = null;
        let textHash: string | null = null;
        let docType = doc.documentType;
        if (fetched.buffer) {
          binaryHash = hashBuffer(fetched.buffer);
          const pdfRes = await extractPdfText(fetched.buffer);
          if (pdfRes.status === "PARSE_FAILED_NO_TEXT") {
            metrics.parse_failed++;
            recordStage(stageResult("parse", parseStarted, { status: "FAILED", source: doc.sourceName, documentId: existing?.id, errorCode: pdfRes.status }));
            contentHash = binaryHash;
            textHash = null;
            if (existing && existing.content_hash === contentHash) { metrics.documents_unchanged++; continue; }
            const failedDocumentType = doc.documentType === "PDF_GABARITO" ? "PDF_GABARITO" : "EDITAL_PDF";
            const metadata = { source_name: doc.sourceName, tier: doc.tier, document_type: failedDocumentType, pdf_status: pdfRes.status };
            if (existing) {
              const { error: versionError } = await svc.from("collector_document_versions").upsert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata }, { onConflict: "document_id,content_hash", ignoreDuplicates: true });
              if (versionError) throw new Error("DOCUMENT_VERSION_WRITE_FAILED");
              const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: "", status: "FAILED", metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
              if (updErr) metrics.errors_count++; else metrics.documents_updated++;
            } else {
              const sourceId = sourceMap.get(doc.sourceName)?.id;
              const { error: insErr } = await svc.from("collector_documents").insert({ source_id: sourceId, source_url: doc.sourceUrl, canonical_url: doc.canonicalUrl, document_type: failedDocumentType, title: doc.title, content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: "", status: "FAILED", metadata });
              if (insErr) metrics.errors_count++; else metrics.documents_new++;
            }
            continue;
          }
          raw = pdfRes.text;
          docType = doc.documentType === "PDF_GABARITO" ? "PDF_GABARITO" : "EDITAL_PDF";
          textHash = hashContent(raw);
          contentHash = textHash;
        } else {
          textHash = hashContent(stableHtmlText(raw));
          contentHash = textHash;
        }
        metrics.parsed_success++;
        recordStage(stageResult("parse", parseStarted, { status: "SUCCESS", source: doc.sourceName, documentId: existing?.id }));
        const classifyStarted = Date.now();
        const page = validateContestPage(doc.title, doc.canonicalUrl, raw);
        if (page.decision === "REJECT") {
          recordStage(stageResult("classify", classifyStarted, { status: "SKIPPED", source: doc.sourceName, documentId: existing?.id, errorCode: "DOCUMENT_REJECTED" }));
          if (existing) {
            const { error } = await svc.from("collector_documents").update({ metadata: { ...(existing.metadata || {}), page_validation: page }, status: "FETCHED", last_seen_run_id: runId, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
            if (error) metrics.errors_count++;
          } else {
            const { error } = await svc.from("collector_documents").insert({ source_id: configuredSource.id, source_url: doc.sourceUrl, canonical_url: doc.canonicalUrl, document_type: docType, title: doc.title, content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: raw.slice(0, 20000), status: "FETCHED", metadata: { source_name: doc.sourceName, tier: doc.tier, page_validation: page }, first_seen_run_id: runId, last_seen_run_id: runId, last_seen_at: new Date().toISOString() });
            if (error) metrics.errors_count++; else metrics.documents_new++;
          }
          continue;
        }
        recordStage(stageResult("classify", classifyStarted, { status: "SUCCESS", source: doc.sourceName, documentId: existing?.id }));
        if (existing && existing.content_hash === contentHash) {
          const { error } = await svc.from("collector_documents").update({ last_seen_run_id: runId, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) metrics.errors_count++; else metrics.documents_unchanged++;
          continue;
        }

        const metadata: Record<string, unknown> = { source_name: doc.sourceName, source_url: doc.sourceUrl, contest_url: doc.contestUrl, identity_title: doc.identityTitle, tier: doc.tier, document_type: docType, page_validation: page, confidence: doc.tier === 1 ? 0.95 : 0.7 };
        const vagasMatch = raw.match(/(\d{1,5})\s+vagas/i);
        const salarioMatch = raw.match(/R\$\s*([\d\.\,]+)/);
        if (vagasMatch) metadata.vagas_hint = vagasMatch[1];
        if (salarioMatch) metadata.salario_hint = salarioMatch[1];

        const identityTitle = doc.identityTitle || doc.title;
        const identity = deterministicIdentity(identityTitle, doc.sourceName);
        const facts = enrichDocument(identityTitle, raw);
        const deterministicExtracted = { orgao: identity.orgao, banca: identity.banca, vagas: facts.vagas, salario: facts.salario, inscricao_inicio: facts.inscricao_inicio, inscricao_fim: facts.inscricao_fim, prova_data: facts.prova_data, cadastro_reserva: facts.cadastro_reserva, cargos: facts.cargos, escolaridade: facts.escolaridade as ("FUNDAMENTAL" | "MEDIO" | "TECNICO" | "SUPERIOR")[], scope: facts.scope as "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "REGIONAL" | null, state_code: facts.state_code, city: facts.city, status: null, evidence: {} };
        const deterministicReady = Boolean(identity.orgao && identity.banca);
        const needsAI = !deterministicReady || facts.evidence.length < 2;
        let status = deterministicReady ? "PROCESSED" : "AI_PENDING";
        let extracted: ExtractConcurso | null = deterministicReady ? deterministicExtracted : null;
        const extractStarted = Date.now();
        if (needsAI && metrics.ai_requests < MAX_AI_PER_RUN) {
          const aiRes = await extractConcursoWithAI(doc.title, raw, generationBudget);
          metrics.ai_requests = generationBudget.calls;
          if (aiRes.ok && aiRes.data) {
            const parsed = ExtractConcursoSchema.safeParse(aiRes.data);
            if (parsed.success) {
              extracted = parsed.data;
              metadata.ai_extracted = parsed.data;
              metadata.ai_provider = aiRes.provider;
              metadata.ai_model = aiRes.model;
              status = "PROCESSED";
              aiProcessed++;
              metrics.ai_success++;
              recordStage(stageResult("extract", extractStarted, { status: "SUCCESS", source: doc.sourceName, documentId: existing?.id }));
            } else {
              metrics.ai_invalid_schema++;
              metadata.ai_error = "INVALID_SCHEMA";
              if (!deterministicReady) { status = "AI_PENDING"; metrics.ai_pending++; }
              recordStage(stageResult("extract", extractStarted, { status: deterministicReady ? "SUCCESS" : "PENDING", source: doc.sourceName, documentId: existing?.id, errorCode: "INVALID_SCHEMA" }));
            }
          } else {
            metadata.ai_error = aiRes.errorCode || "AI_PENDING";
            if (aiRes.errorCode === "INVALID_SCHEMA") metrics.ai_invalid_schema++;
            if (!deterministicReady) { status = "AI_PENDING"; metrics.ai_pending++; }
            recordStage(stageResult("extract", extractStarted, { status: deterministicReady ? "SUCCESS" : "PENDING", source: doc.sourceName, documentId: existing?.id, errorCode: aiRes.errorCode || "AI_PENDING" }));
          }
        } else if (deterministicReady) {
          metadata.extraction_method = "DETERMINISTIC";
          recordStage(stageResult("extract", extractStarted, { status: "SUCCESS", source: doc.sourceName, documentId: existing?.id }));
        } else {
          status = "AI_PENDING";
          metrics.ai_pending++;
          recordStage(stageResult("extract", extractStarted, { status: "PENDING", source: doc.sourceName, documentId: existing?.id, errorCode: "RUN_BUDGET_EXHAUSTED" }));
        }
        if (extracted) metadata.ai_extracted = extracted;

        const persistStarted = Date.now();
        let persistedDocumentId = existing?.id || null;
        if (existing) {
          const { error: verErr } = await svc.from("collector_document_versions").upsert({ document_id: existing.id, content_hash: existing.content_hash, raw_text: existing.raw_text, metadata: existing.metadata }, { onConflict: "document_id,content_hash", ignoreDuplicates: true });
          if (verErr) throw new Error("DOCUMENT_VERSION_WRITE_FAILED");
          const { error: updErr } = await svc.from("collector_documents").update({ content_hash: contentHash, binary_hash: binaryHash, text_hash: textHash, raw_text: raw.slice(0, 20000), status: status === "PROCESSED" ? "PARSED" : status, metadata, published_at: doc.publishedAt || null, collected_at: new Date().toISOString(), last_seen_run_id: runId, last_seen_at: new Date().toISOString(), ai_retry_count: 0, ai_last_error_code: null, ai_claimed_at: null, ai_claim_token: null, ai_claimed_hash: null, ai_next_attempt_at: status === "AI_PENDING" ? new Date().toISOString() : null }).eq("id", existing.id);
          if (updErr) throw new Error("DOCUMENT_UPDATE_FAILED"); else metrics.documents_updated++;
        } else {
          const sourceId = sourceMap.get(doc.sourceName)?.id;
          const { data: inserted, error: insErr } = await svc.from("collector_documents").insert({
            source_id: sourceId,
            source_url: doc.sourceUrl,
            canonical_url: doc.canonicalUrl,
            document_type: docType,
            title: doc.title,
            content_hash: contentHash,
            binary_hash: binaryHash,
            text_hash: textHash,
            raw_text: raw.slice(0, 20000),
            status: status === "PROCESSED" ? "PARSED" : status,
            metadata,
            published_at: doc.publishedAt || null,
            first_seen_run_id: runId,
            last_seen_run_id: runId,
            last_seen_at: new Date().toISOString(),
            ai_next_attempt_at: status === "AI_PENDING" ? new Date().toISOString() : null,
          }).select("id").single();
          if (insErr) throw new Error("DOCUMENT_INSERT_FAILED"); else { persistedDocumentId = inserted.id; metrics.documents_new++; }
        }
        recordStage(stageResult("persist", persistStarted, { status: persistedDocumentId ? "SUCCESS" : "FAILED", source: doc.sourceName, documentId: persistedDocumentId || undefined, errorCode: persistedDocumentId ? undefined : "DOCUMENT_PERSIST_FAILED" }));

        // The logical document relation is persisted only after the collector document has an ID.
        if (persistedDocumentId && status === "PROCESSED" && metadata.ai_extracted) {
          const parsed = ExtractConcursoSchema.safeParse(metadata.ai_extracted);
          if (parsed.success) {
            const resolveStarted = Date.now();
            try {
              const synced = await syncConcursoFromDocument(svc, { ...doc, rawText: raw, documentId: persistedDocumentId, documentType: docType, publishedAt: doc.publishedAt, expectedContentHash: contentHash, metadata }, parsed.data, doc.tier);
              if (!synced) throw new Error("INSUFFICIENT_IDENTITY");
              metrics.concursos_created += synced.created ? 1 : 0;
              metrics.concursos_updated += synced.updated ? 1 : 0;
              metrics.concursos_conflicted += synced.conflicted ? 1 : 0;
              metrics.concursos_publishable += synced.publishable ? 1 : 0;
              metrics.duplicate_candidates += synced.duplicateCandidate ? 1 : 0;
              recordStage(stageResult("resolve", resolveStarted, { status: "SUCCESS", source: doc.sourceName, documentId: persistedDocumentId, concursoId: synced.concursoId }));
              recordStage(stageResult("publish", Date.now(), { status: synced.publishable ? "SUCCESS" : "SKIPPED", source: doc.sourceName, documentId: persistedDocumentId, concursoId: synced.concursoId, errorCode: synced.publishable ? undefined : "PUBLICATION_BLOCKED" }));
            } catch (error) {
              metrics.errors_count++;
              const errorCode = error instanceof Error ? error.message : "ERR";
              const insufficientIdentity = errorCode === "INSUFFICIENT_IDENTITY";
              if (!insufficientIdentity) metrics.ai_pending++;
              recordStage(stageResult("resolve", resolveStarted, { status: "FAILED", source: doc.sourceName, documentId: persistedDocumentId, errorCode }));
              const { error: pendingError } = await svc.from("collector_documents").update({ status: insufficientIdentity ? "FAILED" : "AI_PENDING", metadata: { ...metadata, sync_error: errorCode }, ai_next_attempt_at: insufficientIdentity ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(), ai_last_error_code: insufficientIdentity ? errorCode : "SYNC_FAILED" }).eq("id", persistedDocumentId).eq("content_hash", contentHash);
              if (pendingError) throw new Error(`persist sync retry: ${pendingError.message}`);
            }
          }
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
            if (candErr && !candErr.message.includes("duplicate")) metrics.errors_count++;
          }
          cand++;
        }
      }
    }

    await recalculateHotScores(svc);
    const finalStatus = deriveCollectorRunStatus(metrics);
    const { error: runUpdErr } = await svc.from("collector_runs").update({ finished_at: new Date().toISOString(), status: finalStatus, ...metrics, ai_processed: aiProcessed, stage_results: stages }).eq("id", runId);
    if (runUpdErr) throw new Error(runUpdErr.message);
    return { runId, status: finalStatus, stats: metrics };
  } catch (e) {
    const svc2 = supabaseService();
    const { error: finalizationError } = await svc2.from("collector_runs").update({ finished_at: new Date().toISOString(), status: "FAILED", ...metrics, errors_count: metrics.errors_count + 1, stage_results: stages }).eq("id", runId);
    if (finalizationError) throw new Error("RUN_FAILURE_PERSISTENCE_FAILED", { cause: e });
    throw e;
  }
}
