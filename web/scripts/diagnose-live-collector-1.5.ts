import assert from "node:assert/strict";
import { supabaseService } from "../src/lib/supabase-server";

async function main() {
  const db = supabaseService();
  const [runs, pending, sources, usage] = await Promise.all([
    db.from("collector_runs").select("id,status,stage_results,started_at").order("started_at", { ascending: false }).limit(4),
    db.from("collector_documents")
      .select("id,title,status,ai_retry_count,ai_last_error_code,ai_next_attempt_at,metadata")
      .eq("status", "AI_PENDING")
      .order("collected_at", { ascending: false })
      .limit(10),
    db.from("collector_sources")
      .select("name,enabled,last_status,last_error_code,failure_count,last_documents_count")
      .order("name"),
    db.from("ai_usage_logs")
      .select("provider,model,task_type,success,error_code,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  for (const [name, result] of Object.entries({ runs, pending, sources, usage })) {
    assert.equal(result.error, null, `${name}: ${result.error?.message || "query failed"}`);
  }

  const failedStages = (runs.data || []).flatMap((run) =>
    ((run.stage_results || []) as Array<Record<string, unknown>>)
      .filter((stage) => stage.status === "FAILED" || stage.status === "PENDING")
      .map((stage) => ({ runId: run.id, ...stage })),
  );
  const pendingSafe = (pending.data || []).map((document) => {
    const metadata = (document.metadata || {}) as Record<string, unknown>;
    return {
      id: document.id,
      title: document.title,
      status: document.status,
      retryCount: document.ai_retry_count,
      lastErrorCode: document.ai_last_error_code,
      nextAttemptAt: document.ai_next_attempt_at,
      source: metadata.source_name,
      aiError: metadata.ai_error,
      syncError: metadata.sync_error,
    };
  });

  console.log(JSON.stringify({ failedStages, pending: pendingSafe, sources: sources.data, recentAIUsage: usage.data }, null, 2));
}

main();
