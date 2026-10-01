import type { User } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/supabase-server";

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const { data, error } = await supabaseService().auth.getUser(token);
  return error ? null : data.user;
}
