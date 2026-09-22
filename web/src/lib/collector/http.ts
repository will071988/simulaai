import { isSafeUrl, validateContentType } from "./security";
import crypto from "crypto";
import dns from "node:dns/promises";

const MAX_SIZE_MB = Number(process.env.MAX_DOCUMENT_SIZE_MB || 20);
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIP(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7
  if (ip.startsWith("fe80:")) return true;
  if (ip === "::ffff:127.0.0.1") return true;
  return false;
}

async function isSafeUrlWithDns(urlStr: string): Promise<boolean> {
  if (!isSafeUrl(urlStr)) return false;
  try {
    const u = new URL(urlStr);
    const host = u.hostname;
    // skip DNS for known public hosts to save time? still check
    const lookup = await dns.lookup(host).catch(() => null);
    if (lookup && isPrivateIP(lookup.address)) return false;
  } catch {
    // if DNS fails, allow (maybe host not resolvable, will fail later)
  }
  return true;
}

export async function safeFetch(url: string, opts?: { allowedTypes?: string[]; timeoutMs?: number }): Promise<{ ok: boolean; status: number; text?: string; buffer?: Buffer; contentType?: string; error?: string }> {
  if (!(await isSafeUrlWithDns(url))) return { ok: false, status: 0, error: "SSRF_BLOCKED" };
  let currentUrl = url;
  let redirects = 0;
  while (redirects <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts?.timeoutMs || 12000);
    try {
      const res = await fetch(currentUrl, {
        headers: { "User-Agent": "SimulaAi-Collector/1.0 (+https://simulaai-kappa.vercel.app)", Accept: "text/html,application/pdf,*/*" },
        signal: controller.signal,
        redirect: "manual",
      });
      clearTimeout(t);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, status: res.status, error: `HTTP_${res.status}` };
        const nextUrl = new URL(loc, currentUrl).toString();
        if (!(await isSafeUrlWithDns(nextUrl))) return { ok: false, status: 0, error: "SSRF_BLOCKED_REDIRECT" };
        currentUrl = nextUrl;
        redirects++;
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status, error: `HTTP_${res.status}` };
      const ct = res.headers.get("content-type");
      if (opts?.allowedTypes && !validateContentType(ct, opts.allowedTypes)) return { ok: false, status: res.status, error: "INVALID_CONTENT_TYPE" };
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_BYTES) return { ok: false, status: res.status, error: "TOO_LARGE" };
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
  return { ok: false, status: 0, error: "TOO_MANY_REDIRECTS" };
}

export async function checkRobots(baseUrl: string, path: string): Promise<{ allowed: boolean; status: string }> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    if (!(await isSafeUrlWithDns(robotsUrl))) return { allowed: false, status: "SSRF_BLOCKED" };
    const res = await safeFetch(robotsUrl, { allowedTypes: ["text/plain"], timeoutMs: 5000 });
    if (!res.ok || !res.text) {
      if (res.error === "TIMEOUT") return { allowed: false, status: "ROBOTS_UNKNOWN" };
      return { allowed: true, status: "NO_ROBOTS" };
    }
    const lines = res.text.split("\n");
    let currentUA = "*";
    const relevantDisallows: string[] = [];
    const relevantAllows: string[] = [];
    for (const raw of lines) {
      const line = raw.split("#")[0].trim();
      if (!line) continue;
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (k.toLowerCase() === "user-agent") {
        currentUA = v.toLowerCase();
      } else if (currentUA === "*" || currentUA === "simulaai-collector" || currentUA === "simulaai") {
        if (k.toLowerCase() === "disallow") relevantDisallows.push(v);
        if (k.toLowerCase() === "allow") relevantAllows.push(v);
      }
    }
    // precedência Allow sobre Disallow se mais específico
    const match = (pattern: string, p: string) => {
      if (!pattern) return false;
      const reStr = pattern.replace(/\*/g, ".*").replace(/\?/g, "\\?");
      return new RegExp("^" + reStr).test(p);
    };
    for (const d of relevantDisallows) if (match(d, path)) {
      // check if any Allow overrides
      for (const a of relevantAllows) if (match(a, path) && a.length > d.length) return { allowed: true, status: "ROBOTS_ALLOWED" };
      return { allowed: false, status: "ROBOTS_BLOCKED" };
    }
    return { allowed: true, status: "ROBOTS_ALLOWED" };
  } catch {
    return { allowed: false, status: "ROBOTS_UNKNOWN" };
  }
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
export function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; status: string }> {
  try {
    const pdfParseModule = await import("pdf-parse") as unknown as { default?: (b: Buffer) => Promise<{ text: string }> } & ((b: Buffer) => Promise<{ text: string }>);
    const pdfParse = (pdfParseModule.default || pdfParseModule) as (b: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    const text = (data.text || "").trim();
    if (!text || text.length < 50) return { text: "", status: "PARSE_FAILED_NO_TEXT" };
    return { text: text.slice(0, 50000), status: "PARSED" };
  } catch {
    return { text: "", status: "PARSE_FAILED_NO_TEXT" };
  }
}
