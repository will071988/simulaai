import { authenticatedUser } from "@/lib/auth/server";
import { supabaseService } from "@/lib/supabase-server";

/** Every private operations request revalidates Auth and the current admin grant. */
export async function authorizeOperations(request: Request) {
  const user = await authenticatedUser(request);
  if (!user || user.is_anonymous || !user.email_confirmed_at) return { status: 401 as const, user: null };
  const { data, error } = await supabaseService().from("ops_admin_members").select("role").eq("user_id", user.id).maybeSingle();
  if (error) return { status: 503 as const, user: null };
  if (data?.role !== "ADMIN") return { status: 403 as const, user: null };
  return { status: 200 as const, user };
}
