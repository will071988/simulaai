import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";

const FollowSchema = z.object({ concursoId: z.string().uuid(), favorite: z.boolean(), following: z.boolean() }).strict();
const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const svc = supabaseService();
  const requestedId = new URL(request.url).searchParams.get("concursoId");
  if (requestedId) {
    const id = z.string().uuid().safeParse(requestedId);
    if (!id.success) return NextResponse.json({ error: "INVALID_CONTEST_ID" }, { status: 400, headers: noStore });
    const follow = await svc.from("contest_follows").select("concurso_id,is_favorite,is_following,updated_at").eq("user_id", user.id).eq("concurso_id", id.data).maybeSingle();
    if (follow.error) return NextResponse.json({ error: "FOLLOWS_QUERY_FAILED" }, { status: 500, headers: noStore });
    return NextResponse.json({ data: { follow: follow.data || null } }, { headers: noStore });
  }
  const [follows, contests] = await Promise.all([
    svc.from("contest_follows").select("concurso_id,is_favorite,is_following,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
    svc.from("concursos").select("id,titulo,orgao,status,inscricao_fim,prova_data").eq("is_publishable", true).is("merged_into_id", null).order("hot_score", { ascending: false }).limit(100),
  ]);
  if (follows.error || contests.error) return NextResponse.json({ error: "FOLLOWS_QUERY_FAILED" }, { status: 500, headers: noStore });
  return NextResponse.json({ data: { follows: follows.data || [], contests: contests.data || [] } }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const parsed = FollowSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_FOLLOW" }, { status: 400, headers: noStore });
  const svc = supabaseService();
  const contest = await svc.from("concursos").select("id").eq("id", parsed.data.concursoId).eq("is_publishable", true).is("merged_into_id", null).maybeSingle();
  if (contest.error || !contest.data) return NextResponse.json({ error: "CONTEST_NOT_AVAILABLE" }, { status: 404, headers: noStore });
  if (!parsed.data.favorite && !parsed.data.following) {
    const removed = await svc.from("contest_follows").delete().eq("user_id", user.id).eq("concurso_id", parsed.data.concursoId);
    if (removed.error) return NextResponse.json({ error: "FOLLOW_SAVE_FAILED" }, { status: 500, headers: noStore });
    return NextResponse.json({ data: null }, { headers: noStore });
  }
  const saved = await svc.from("contest_follows").upsert({ user_id: user.id, concurso_id: parsed.data.concursoId, is_favorite: parsed.data.favorite, is_following: parsed.data.following, updated_at: new Date().toISOString() }, { onConflict: "user_id,concurso_id" }).select("concurso_id,is_favorite,is_following,updated_at").single();
  if (saved.error) return NextResponse.json({ error: "FOLLOW_SAVE_FAILED" }, { status: 500, headers: noStore });
  return NextResponse.json({ data: saved.data }, { headers: noStore });
}
