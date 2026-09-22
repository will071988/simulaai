import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase-server";
import { generateWithFallback } from "@/lib/ai/router";

export async function GET() {
  const svc = supabaseService();
  const { data: docs } = await svc.from("collector_documents").select("id, raw_text, metadata").eq("status", "AI_PENDING").limit(5);
  let processed = 0;
  for (const d of docs || []) {
    const res = await generateWithFallback<{ orgao: string | null; banca: string | null; vagas: number | null }>(
      { taskType: "EXTRACT_CONCURSO", prompt: "Extraia concurso JSON {orgao,banca,vagas} evidence.", input: { snippet: (d.raw_text || "").slice(0, 4000) }, promptVersion: "extract_concurso_v1" },
      { validate: (x) => typeof x === "object" && x !== null }
    );
    if (res.ok) {
      await svc.from("collector_documents").update({ status: "PROCESSED", metadata: { ...(d.metadata as object), ai_extracted: res.data, ai_provider: res.provider }, processed_at: new Date().toISOString() }).eq("id", d.id);
      processed++;
    }
  }
  return NextResponse.json({ ok: true, processed, pending: (docs || []).length });
}
