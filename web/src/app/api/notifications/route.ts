import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";

const ReadSchema = z.object({ eventId: z.string().uuid() }).strict();
const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const svc = supabaseService();
  const materialized = await svc.rpc("materialize_deadline_notifications", { p_user_id: user.id });
  if (materialized.error) return NextResponse.json({ error: "NOTIFICATIONS_MATERIALIZE_FAILED" }, { status: 500, headers: noStore });
  const { data, error } = await svc.from("user_notifications").select("event_id,read_at,created_at,notification_events(id,concurso_id,event_type,title,message,source_url,created_at,concursos(titulo,orgao))").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "NOTIFICATIONS_QUERY_FAILED" }, { status: 500, headers: noStore });
  return NextResponse.json({ data: data || [] }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const parsed = ReadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_NOTIFICATION" }, { status: 400, headers: noStore });
  const { data, error } = await supabaseService().from("user_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("event_id", parsed.data.eventId).select("event_id,read_at").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "NOTIFICATION_NOT_FOUND" }, { status: 404, headers: noStore });
  return NextResponse.json({ data }, { headers: noStore });
}
