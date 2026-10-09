import type { User } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/supabase-server";

const MAX_BEARER_LENGTH = 8192;

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.length > MAX_BEARER_LENGTH + 16) return null;
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  const token = match?.[1] || "";
  if (!token || token.length > MAX_BEARER_LENGTH) return null;
  return token;
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const { data, error } = await supabaseService().auth.getUser(token);
  return error ? null : data.user;
}
