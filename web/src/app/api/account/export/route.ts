import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "private, no-store" };

async function handleGET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  const svc = supabaseService();
  const [profile, attempts, plans, follows, notifications] = await Promise.all([
    svc.from("user_profiles").select("user_id,nome,created_at,updated_at").eq("user_id", user.id).maybeSingle(),
    svc.from("simulado_attempts").select("id,simulado_id,started_at,completed_at,answers,score,correct_count,duration_seconds,status").eq("user_id", user.id).order("started_at", { ascending: false }).limit(10000),
    svc.from("study_plans").select("id,concurso_id,cargo,exam_date,daily_minutes,disciplines,discipline_weights,allocation,schedule,days_remaining,generated_for,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1000),
    svc.from("contest_follows").select("concurso_id,is_favorite,is_following,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5000),
    svc.from("user_notifications").select("event_id,read_at,created_at,notification_events(event_type,title,message,source_url,created_at,concurso_id)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5000),
  ]);

  const failures = [profile, attempts, plans, follows, notifications].filter((result) => result.error);
  if (failures.length) return NextResponse.json({ error: "ACCOUNT_EXPORT_FAILED" }, { status: 500, headers: noStore });

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email || null },
    profile: profile.data || null,
    simuladoAttempts: attempts.data || [],
    studyPlans: plans.data || [],
    contestFollows: follows.data || [],
    notifications: notifications.data || [],
    note: "Senhas, hashes de sessão, chaves e outros segredos de segurança não fazem parte da exportação.",
  };

  return NextResponse.json(payload, {
    headers: {
      ...noStore,
      "content-disposition": 'attachment; filename="simulaai-dados.json"',
      "x-content-type-options": "nosniff",
    },
  });
}

export const GET = observeApiRoute("/api/account/export", handleGET);
