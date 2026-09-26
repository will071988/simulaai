import crypto from "node:crypto";
import { supabaseService } from "@/lib/supabase-server";

export const PUBLIC_BODY_LIMIT = 32 * 1024;
export const QUIZ_RATE_LIMIT = 20;

export class PublicRequestError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function readJsonBody<T>(request: Request, maxBytes = PUBLIC_BODY_LIMIT): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new PublicRequestError(413, "PAYLOAD_TOO_LARGE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new PublicRequestError(413, "PAYLOAD_TOO_LARGE"); }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  try { return JSON.parse(text) as T; } catch { throw new PublicRequestError(400, "INVALID_JSON"); }
}

export function hashRateLimitIdentity(identity: string, route: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${route}:${identity}`).digest("hex");
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function enforceQuizRateLimit(request: Request, route: string, sessionId?: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const salt = process.env.RATE_LIMIT_SALT || process.env.CRON_SECRET;
  if (!salt) throw new Error("RATE_LIMIT_NOT_CONFIGURED");
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60000) * 60000).toISOString();
  const identities = [`origin:${clientIp(request)}`];
  if (sessionId) identities.push(`session:${sessionId}`);
  const svc = supabaseService();
  for (const identity of identities) {
    const key = hashRateLimitIdentity(identity, route, salt);
    const { data, error } = await svc.rpc("consume_api_rate_limit", { p_key_hash: key, p_route: route, p_window_start: windowStart, p_limit: QUIZ_RATE_LIMIT });
    if (error) throw new Error("RATE_LIMIT_PERSISTENCE_FAILED");
    if (Number(data) > QUIZ_RATE_LIMIT) return { allowed: false, retryAfter: Math.max(1, 60 - Math.floor((now % 60000) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}
