import { supabaseService } from "@/lib/supabase-server";
import { adapters } from "./adapters";
import { safeFetch, hashContent, hashBuffer } from "./http";
import { generateWithFallback } from "@/lib/ai/router";
import type { DiscoveredDocument } from "./types";
import { isSafeUrl } from "./security";

const MAX_AI_PER_RUN = Number(process.env.MAX_AI_REQUESTS_PER_RUN || 30);

export async function runCollector(): Promise<{ runId: string; status: string; stats: { sourcesChecked: number; documentsFound: number; documentsNew: number; aiPending: number } }> {
  if (process.env.COLLECTOR_ENABLED === "false") return { runId: "", status: "DISABLED", stats: { sourcesChecked: 0, documentsFound: 0, documentsNew: 0, aiPending: 0 } };
  const svc = supabaseService();
  const { data: run } = await svc.from("collector_runs").insert({ status: "RUNNING" }).select("id").single();
  const runId = run?.id as string;
  let sourcesChecked = 0, documentsFound = 0, documentsNew = 0, aiPending = 0, aiProcessed = 0, errors = 0;

  try {
    // load sources from db
    const { data: sources } = await svc.from("collector_sources").select("*").eq("enabled", true);
    const sourceMap = new Map((sources || []).map((s) => [s.name, s]));

    for (const adapter of adapters) {
      sourcesChecked++;
      // rate limit per domain: 800ms
      await new Promise((r) => setTimeout(r, 800));
      let discovered: DiscoveredDocument[] = [];
      try {
        discovered = await adapter.discover();
      } catch {
        errors++;
        await svc.from("collector_sources").update({ last_failure_at: new Date().toISOString(), failure_count: (sourceMap.get(adapter.sourceName)?.failure_count || 0) + 1 }).eq("name", adapter.sourceName);
        continue;
      }
      await svc.from("collector_sources").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("name", adapter.sourceName);
      documentsFound += discovered.length;

      for (const doc of discovered) {
        if (!isSafeUrl(doc.canonicalUrl)) { errors++; continue; }
        // check existing by canonical_url
        const { data: existing } = await svc.from("collector_documents").select("id, content_hash, status").eq("canonical_url", doc.canonicalUrl).limit(1).maybeSingle();
        // fetch document
        const fetched = await safeFetch(doc.canonicalUrl, { allowedTypes: ["text/html", "application/pdf"] });
        if (!fetched.ok) { errors++; continue; }
        const raw = fetched.text || "";
        const contentHash = fetched.buffer ? hashBuffer(fetched.buffer) : hashContent(raw.slice(0, 20000));
        if (existing && existing.content_hash === contentHash) continue; // idempotent

        let status: string = "FETCHED";
        const metadata: Record<string, unknown> = { source_name: doc.sourceName, source_url: doc.sourceUrl, tier: doc.tier, document_type: doc.documentType };

        // deterministic parse: extract vagas/salario via regex before IA
        const vagasMatch = raw.match(/(\d{1,5})\s+vagas/i);
        const salarioMatch = raw.match(/R\$\s*([\d\.\,]+)/);
        if (vagasMatch) metadata.vagas_hint = vagasMatch[1];
        if (salarioMatch) metadata.salario_hint = salarioMatch[1];

        // AI extraction (free router) — only if new/changed and within budget
        if (aiProcessed < MAX_AI_PER_RUN) {
          const aiRes = await generateWithFallback<{ orgao: string | null; banca: string | null; vagas: number | null; status: string | null }>({
            taskType: "EXTRACT_CONCURSO",
            prompt: `Extraia concurso. Retorne JSON {orgao,banca,vagas,status} com evidence. Não invente. Se não houver, null. Prompt v1.`,
            input: { title: doc.title, snippet: raw.slice(0, 4000) },
            promptVersion: "extract_concurso_v1",
          }, { validate: (d) => typeof d === "object" && d !== null });
          if (aiRes.ok && aiRes.data) {
            metadata.ai_extracted = aiRes.data;
            metadata.ai_provider = aiRes.provider;
            metadata.ai_model = aiRes.model;
            status = "PROCESSED";
            aiProcessed++;
            // sync to concursos if high confidence TIER1
            if (doc.tier === 1 && aiRes.data.orgao && aiRes.data.banca) {
              try {
                await svc.from("concursos").upsert({ orgao: aiRes.data.orgao, titulo: doc.title, banca: aiRes.data.banca, vagas: aiRes.data.vagas, status: aiRes.data.status || "previsto", edital_url: doc.canonicalUrl }, { onConflict: "edital_url" });
              } catch {}
            }
          } else if (aiRes.errorCode === "AI_PENDING" || aiRes.degraded) {
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
          await svc.from("collector_documents").update({ content_hash: contentHash, raw_text: raw.slice(0, 20000), status, metadata, collected_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          const sourceId = sourceMap.get(doc.sourceName)?.id;
          await svc.from("collector_documents").insert({
            source_id: sourceId,
            source_url: doc.sourceUrl,
            canonical_url: doc.canonicalUrl,
            document_type: doc.documentType,
            title: doc.title,
            content_hash: contentHash,
            raw_text: raw.slice(0, 20000),
            status,
            metadata,
          });
          documentsNew++;
        }
        // candidate source discovery (urls found in page)
        const urlRe = /https?:\/\/[^\s"'<>]+/g;
        let u: RegExpExecArray | null;
        let cand = 0;
        while ((u = urlRe.exec(raw)) && cand < 3) {
          const candUrl = u[0];
          if (!isSafeUrl(candUrl)) continue;
          if (candUrl.includes("pciconcursos") || candUrl.includes("jcconcursos") || candUrl.includes("cebraspe")) {
            // skip known
          } else if (candUrl.includes("concurso") || candUrl.includes("edital")) {
            try { await svc.from("source_candidates").insert({ url: candUrl, domain: new URL(candUrl).hostname, reason: "discovered in document", found_by: doc.sourceName, confidence: 0.6 }); } catch {}
          }
          cand++;
        }
      }
    }

    const finalStatus = aiPending > 0 && aiProcessed === 0 && process.env.AI_ENABLED !== "false" ? "DEGRADED_NO_AI" : "SUCCESS";
    await svc.from("collector_runs").update({ finished_at: new Date().toISOString(), status: finalStatus, sources_checked: sourcesChecked, documents_found: documentsFound, documents_new: documentsNew, documents_updated: 0, ai_processed: aiProcessed, ai_pending: aiPending, errors_count: errors }).eq("id", runId);
    return { runId, status: finalStatus, stats: { sourcesChecked, documentsFound, documentsNew, aiPending } };
  } catch (e) {
    await supabaseService().from("collector_runs").update({ finished_at: new Date().toISOString(), status: "FAILED", sources_checked: sourcesChecked, documents_found: documentsFound, documents_new: documentsNew, errors_count: errors + 1 }).eq("id", runId);
    throw e;
  }
}
