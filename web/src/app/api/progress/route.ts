import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";
import { observeApiRoute } from "@/lib/observability/operations";

const privateNoStore = { "cache-control": "private, no-store" };

async function handleGET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: privateNoStore });
  const { data, error } = await supabaseService().rpc("get_user_progress", { p_user_id: user.id });
  if (error || !data) return NextResponse.json({ error: "PROGRESS_QUERY_FAILED" }, { status: 500, headers: privateNoStore });
  return NextResponse.json({ data }, { headers: privateNoStore });
}

export const GET = observeApiRoute("/api/progress", handleGET);
