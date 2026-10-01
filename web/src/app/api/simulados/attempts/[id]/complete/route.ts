import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase-server";
import { hashAttemptToken, isAttemptToken } from "@/lib/simulados/security";

const CompleteSchema = z.object({
  token: z.string(),
  answers: z.record(z.string().uuid(), z.string().trim().min(1).max(5)).refine((value) => Object.keys(value).length <= 100),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "INVALID_ATTEMPT_ID" }, { status: 400 });
    const parsed = CompleteSchema.safeParse(await request.json());
    if (!parsed.success || !isAttemptToken(parsed.data.token)) return NextResponse.json({ error: "INVALID_ATTEMPT_RESULT" }, { status: 400 });
    const { data, error } = await supabaseService().rpc("complete_simulado_attempt", {
      p_attempt_id: id,
      p_token_hash: hashAttemptToken(parsed.data.token),
      p_answers: parsed.data.answers,
    });
    if (error || !data) return NextResponse.json({ error: "ATTEMPT_COMPLETE_FAILED" }, { status: 404 });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "ATTEMPT_COMPLETE_FAILED" }, { status: 500 });
  }
}
