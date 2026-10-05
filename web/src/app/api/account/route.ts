import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { ProfileUpdateSchema, safeProfile } from "@/lib/auth/profile";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const noStore = { "cache-control": "no-store" };

async function handleGET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const { data, error } = await supabaseService().from("user_profiles").select("user_id,nome,created_at,updated_at").eq("user_id", user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404, headers: noStore });
  return NextResponse.json({ data: { ...safeProfile(data as Record<string, unknown>), email: user.email || null } }, { headers: noStore });
}

async function handlePATCH(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400, headers: noStore }); }
  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROFILE" }, { status: 400, headers: noStore });
  const { data, error } = await supabaseService().from("user_profiles").update({ nome: parsed.data.nome }).eq("user_id", user.id).select("user_id,nome,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: "PROFILE_UPDATE_FAILED" }, { status: 500, headers: noStore });
  return NextResponse.json({ data: safeProfile(data as Record<string, unknown>) }, { headers: noStore });
}

async function handleDELETE(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const { error } = await supabaseService().auth.admin.deleteUser(user.id, false);
  if (error) return NextResponse.json({ error: "ACCOUNT_DELETE_FAILED" }, { status: 500, headers: noStore });
  return NextResponse.json({ data: { deleted: true } }, { headers: noStore });
}

export const GET = observeApiRoute("/api/account", handleGET);
export const PATCH = observeApiRoute("/api/account", handlePATCH);
export const DELETE = observeApiRoute("/api/account", handleDELETE);
