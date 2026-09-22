import { isSafeUrl, validateContentType } from "./security";

const MAX_SIZE_MB = Number(process.env.MAX_DOCUMENT_SIZE_MB || 20);
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function safeFetch(url: string, opts?: { allowedTypes?: string[]; timeoutMs?: number }): Promise<{ ok: boolean; status: number; text?: string; buffer?: Buffer; contentType?: string; error?: string }> {
  if (!isSafeUrl(url)) return { ok: false, status: 0, error: "SSRF_BLOCKED" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs || 12000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SimulaAi-Collector/1.0 (+https://simulaai-kappa.vercel.app)", Accept: "text/html,application/pdf,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP_${res.status}` };
    const ct = res.headers.get("content-type");
    if (opts?.allowedTypes && !validateContentType(ct, opts.allowedTypes)) return { ok: false, status: res.status, error: "INVALID_CONTENT_TYPE" };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return { ok: false, status: res.status, error: "TOO_LARGE" };
    // For demo, fetch as text (PDF handled as buffer if needed)
    if (ct?.includes("pdf")) {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return { ok: false, status: res.status, error: "TOO_LARGE" };
      return { ok: true, status: res.status, buffer: Buffer.from(ab), contentType: ct };
    }
    const text = await res.text();
    if (text.length > MAX_BYTES) return { ok: false, status: res.status, error: "TOO_LARGE" };
    return { ok: true, status: res.status, text, contentType: ct || undefined };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : "ERR";
    if (msg.includes("abort")) return { ok: false, status: 0, error: "TIMEOUT" };
    return { ok: false, status: 0, error: msg };
  }
}

export async function checkRobots(baseUrl: string, path: string): Promise<boolean> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    if (!isSafeUrl(robotsUrl)) return false;
    const res = await safeFetch(robotsUrl, { allowedTypes: ["text/plain"], timeoutMs: 5000 });
    if (!res.ok || !res.text) return true; // allow if no robots
    const lines = res.text.split("\n").map((l) => l.trim().toLowerCase());
    // naive: if Disallow: path
    for (const l of lines) if (l.startsWith("disallow:") && l.includes(path.toLowerCase())) return false;
    return true;
  } catch { return true; }
}

import crypto from "crypto";
export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
export function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
