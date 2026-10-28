import { supabaseService } from "@/lib/supabase-server";

export type PaidBudgetReservation = { jobKey: string; estimatedCostUsd: number };

/** Atomic reservation. A missing RPC fails closed; it must never become a paid call. */
export async function reservePaidBudget(reservation: PaidBudgetReservation): Promise<boolean> {
  try {
    const { data, error } = await supabaseService().rpc("reserve_openai_paid_budget", {
      p_job_key: reservation.jobKey,
      p_estimated_cost_usd: reservation.estimatedCostUsd,
      p_max_calls: Number(process.env.OPENAI_MAX_CALLS_PER_DAY || 0),
      p_max_spend_usd: Number(process.env.OPENAI_MAX_SPEND_USD_PER_DAY || 0),
      p_max_attempts_per_job: Number(process.env.OPENAI_MAX_PAID_ATTEMPTS_PER_JOB || 1),
    });
    return !error && data === true;
  } catch { return false; }
}
