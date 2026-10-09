import { createHmac, timingSafeEqual } from "node:crypto";

const stripeApi = "https://api.stripe.com/v1";

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  return key;
}

export async function stripeRequest<T>(path: string, init?: { method?: "GET" | "POST"; body?: URLSearchParams }): Promise<T> {
  const response = await fetch(`${stripeApi}${path}`, {
    method: init?.method || "GET",
    headers: {
      authorization: `Bearer ${secretKey()}`,
      ...(init?.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.body?.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: { code?: string } }).error?.code || "STRIPE_API_ERROR")
      : "STRIPE_API_ERROR";
    throw new Error(code);
  }
  return payload as T;
}

export function formBody(entries: Array<[string, string | number | boolean | null | undefined]>) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    body.set(key, String(value));
  }
  return body;
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const pieces = signatureHeader.split(",");
  const timestamp = pieces.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = pieces.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}
