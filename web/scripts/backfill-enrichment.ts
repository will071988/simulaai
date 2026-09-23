import { loadEnvConfig } from "@next/env";
import { supabaseService } from "../src/lib/supabase-server";
import { ExtractConcursoSchema } from "../src/lib/collector/schemas";
import { deterministicIdentity, enrichDocument } from "../src/lib/collector/enrichment";
import { syncConcursoFromDocument } from "../src/lib/collector/syncConcurso";

loadEnvConfig(process.cwd());

async function main() {
  const svc = supabaseService();
  const { data, error } = await svc.from("collector_documents").select("id,title,canonical_url,raw_text,metadata").not("raw_text", "is", null);
  if (error) throw error;
  let synced = 0;
  for (const doc of data || []) {
    const metadata = (doc.metadata || {}) as { tier?: number; source_name?: string };
    const identity = deterministicIdentity(doc.title || "", metadata.source_name || "");
    if (!identity.orgao || !identity.banca) continue;
    const facts = enrichDocument(doc.title || "", doc.raw_text || "");
    const parsed = ExtractConcursoSchema.safeParse({ ...identity, ...facts, status: null, evidence: {} });
    if (!parsed.success) continue;
    await syncConcursoFromDocument(svc, { title: doc.title, canonicalUrl: doc.canonical_url, sourceName: metadata.source_name, rawText: doc.raw_text, documentId: doc.id }, parsed.data, metadata.tier || 2);
    synced++;
  }
  console.log(`backfilled enrichment: ${synced}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
