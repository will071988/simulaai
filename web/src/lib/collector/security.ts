const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
const BLOCKED_PREFIXES = ["10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "169.254."];

export function isSafeUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return false;
    if (host === "169.254.169.254") return false;
    for (const p of BLOCKED_PREFIXES) if (host.startsWith(p)) return false;
    if (host.endsWith(".internal") || host.endsWith(".local")) return false;
    if (u.username || u.password) return false;
    return true;
  } catch { return false; }
}

export function validateContentType(ct: string | null, allowed: string[]): boolean {
  if (!ct) return false;
  const low = ct.toLowerCase();
  return allowed.some((a) => low.includes(a));
}
