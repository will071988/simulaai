import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeOperations } from "@/lib/admin/authorize";
import { supabaseService } from "@/lib/supabase-server";
import { publishStarterBank } from "@/lib/questions/publish-starter";
import { STARTER_BANK_REVISION } from "@/lib/questions/starter-bank";
import { observeApiRoute } from "@/lib/observability/operations";
import { revalidatePath, revalidateTag } from "next/cache";
import { PRACTICE_CATALOG_TAG } from "@/lib/simulados/practice-catalog";

const noStore = { "Cache-Control": "private, no-store" };
const PublishSchema = z.object({ action: z.literal("PUBLISH_STARTER_BANK"), revision: z.literal(STARTER_BANK_REVISION) }).strict();
async function handlePOST(request: Request) {
  const access = await authorizeOperations(request);
  if (!access.user) return NextResponse.json({ error: access.status === 401 ? "AUTH_REQUIRED" : "ADMIN_ONLY" }, { status: access.status, headers: noStore });
  const input = await request.json().catch(() => null);
  if (!PublishSchema.safeParse(input).success) return NextResponse.json({ error: "INVALID_CONTENT_RELEASE" }, { status: 400, headers: noStore });
  try {
    const data = await publishStarterBank(supabaseService(), access.user.id);
    revalidateTag(PRACTICE_CATALOG_TAG, { expire: 0 });
    revalidatePath("/");
    console.info(JSON.stringify({ event: "content_release_completed", actorId: access.user.id, ...data }));
    return NextResponse.json({ data }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error && /^STARTER_[A-Z_]+$/.test(error.message) ? error.message : "CONTENT_RELEASE_FAILED";
    console.error(JSON.stringify({ event: "content_release_failed", revision: STARTER_BANK_REVISION, code }));
    return NextResponse.json({ error: "CONTENT_RELEASE_FAILED" }, { status: 500, headers: noStore });
  }
}
export const POST = observeApiRoute("/api/admin/content/starter", handlePOST);
