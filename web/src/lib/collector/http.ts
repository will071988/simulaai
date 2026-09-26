import { isSafeUrl, validateContentType } from "./security";
import crypto from "crypto";
import dns from "node:dns/promises";

const MAX_SIZE_MB = Number(process.env.MAX_DOCUMENT_SIZE_MB || 20);
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_REDIRECTS = 5;

export function isPrivateIP(input: string): boolean {
  const ip = input.toLowerCase().split("%")[0];
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mapped) return isPrivateIP(mapped);
  if (ip.includes(":")) {
    const [head, tail] = ip.split("::");
    const left = head ? head.split(":") : [];
    const right = tail ? tail.split(":") : [];
    const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right].map((group) => Number.parseInt(group || "0", 16));
    if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) return true;
    if (groups.slice(0, 7).every((group) => group === 0) && (groups[7] === 0 || groups[7] === 1)) return true;
    if ((groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80) return true;
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
      return isPrivateIP(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`);
    }
    return false;
  }
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224;
}

type LookupAll = (hostname: string) => Promise<{ address: string; family: number }[]>;
const lookupAll: LookupAll = (hostname) => dns.lookup(hostname, { all: true });

export async function validateUrlWithDns(urlStr: string, lookup: LookupAll = lookupAll): Promise<{ safe: boolean; error?: string }> {
  if (!isSafeUrl(urlStr)) return { safe: false, error: "SSRF_BLOCKED" };
  try {
    const addresses = await lookup(new URL(urlStr).hostname);
    if (!addresses.length) return { safe: false, error: "SSRF_DNS_VALIDATION_FAILED" };
    if (addresses.some(({ address }) => isPrivateIP(address))) return { safe: false, error: "SSRF_BLOCKED" };
    return { safe: true };
  } catch {
    return { safe: false, error: "SSRF_DNS_VALIDATION_FAILED" };
  }
}

export async function safeFetch(url: string, opts?: { allowedTypes?: string[]; timeoutMs?: number }): Promise<{ ok: boolean; status: number; text?: string; buffer?: Buffer; contentType?: string; error?: string }> {
  const initialValidation = await validateUrlWithDns(url);
  if (!initialValidation.safe) return { ok: false, status: 0, error: initialValidation.error };
  let currentUrl = url;
  let redirects = 0;
  while (redirects <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts?.timeoutMs || 12000);
    try {
      // Residual TOCTOU risk: Node fetch does not expose socket pinning to the validated DNS result.
      // We fail closed on DNS errors/private answers and repeat validation for every redirect.
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
        const redirectValidation = await validateUrlWithDns(nextUrl);
        if (!redirectValidation.safe) return { ok: false, status: 0, error: redirectValidation.error === "SSRF_DNS_VALIDATION_FAILED" ? redirectValidation.error : "SSRF_BLOCKED_REDIRECT" };
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
    const validation = await validateUrlWithDns(robotsUrl);
    if (!validation.safe) return { allowed: false, status: validation.error || "SSRF_BLOCKED" };
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
