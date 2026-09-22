import { supabaseService } from "@/lib/supabase-server";

export async function acquireCollectorLock(runId: string, ttlSeconds = 600): Promise<boolean> {
  const svc = supabaseService();
  const { data, error } = await svc.rpc("acquire_collector_lock", { p_run_id: runId, p_ttl_seconds: ttlSeconds });
  if (error) throw new Error(`acquire lock: ${error.message}`);
  return data as boolean;
}
export async function releaseCollectorLock(runId: string): Promise<void> {
  const svc = supabaseService();
  await svc.rpc("release_collector_lock", { p_run_id: runId });
}
