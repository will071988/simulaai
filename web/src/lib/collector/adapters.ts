import type { DiscoveredDocument } from "./types";
import { safeFetch, checkRobots } from "./http";
import * as cheerio from "cheerio";

export interface CollectorSourceAdapter {
  sourceName: string;
  baseUrl: string;
  tier: number;
  discover(): Promise<DiscoveredDocument[]>;
}

export class CollectorDiscoveryError extends Error {
  constructor(public code: string) { super(code); }
}

async function fetchDiscoveryPage(baseUrl: string, path: string, timeoutMs: number) {
  const robots = await checkRobots(baseUrl, path);
  if (!robots.allowed) throw new CollectorDiscoveryError(robots.status || "ROBOTS_BLOCKED");
  const res = await safeFetch(new URL(path, baseUrl).toString(), { allowedTypes: ["text/html"], timeoutMs, allowedOrigin: baseUrl });
  if (!res.ok || !res.text) throw new CollectorDiscoveryError(res.error || `HTTP_${res.status}`);
  return res.text;
}

function toAbs(base: string, href: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

export function isOfficialSourceUrl(baseUrl: string, candidate: string, path: RegExp): boolean {
  try {
    const base = new URL(baseUrl);
    const url = new URL(candidate, base);
    return url.protocol === "https:" && url.origin === base.origin && !url.username && !url.password && path.test(url.pathname);
  } catch { return false; }
}

export class CebraspeAdapter implements CollectorSourceAdapter {
  sourceName = "Cebraspe";
  baseUrl = "https://www.cebraspe.org.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    // The no-slash endpoint currently redirects HTTPS -> HTTP -> HTTPS. Start
    // at the canonical slash URL so the SSRF guard can keep rejecting scheme
    // changes without making the official adapter unusable.
    const html = await fetchDiscoveryPage(this.baseUrl, "/concursos/", 10000);
    const $ = cheerio.load(html);
    const docs: DiscoveredDocument[] = [];
    const seen = new Set<string>();
    $("a").each((_, el) => {
      if (docs.length >= 12) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !isOfficialSourceUrl(this.baseUrl, url, /^\/concursos\//i) || seen.has(url)) return;
      seen.add(url);
      const title = $(el).text().trim().replace(/\s+/g, " ").slice(0, 200) || $(el).attr("title") || url;
      // generic discovery: any concurso, not filtered by known keywords
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: this.tier, sourceId: "" });
    });
    return docs;
  }
}

export class DOUAdapter implements CollectorSourceAdapter {
  sourceName = "DOU";
  baseUrl = "https://www.in.gov.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const html = await fetchDiscoveryPage(this.baseUrl, "/web/dou/-/concurso", 8000);
    const $ = cheerio.load(html);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 6) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !isOfficialSourceUrl(this.baseUrl, url, /^\/web\/dou(?:\/|$)/i)) return;
      const title = $(el).text().trim().slice(0, 200);
      if (!title || title.length < 8) return;
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: 1, sourceId: "" });
    });
    return docs;
  }
}

export class PCIAdapter implements CollectorSourceAdapter {
  sourceName = "PCI Concursos";
  baseUrl = "https://www.pciconcursos.com.br";
  tier = 2;
  async discover(): Promise<DiscoveredDocument[]> {
    const html = await fetchDiscoveryPage(this.baseUrl, "/concursos", 8000);
    const $ = cheerio.load(html);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 6) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !isOfficialSourceUrl(this.baseUrl, url, /^\/concursos\/.+/i)) return;
      const title = $(el).text().trim().slice(0, 200);
      if (title.length < 10) return;
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: 2, sourceId: "" });
    });
    return docs;
  }
}

export class FGVAdapter implements CollectorSourceAdapter {
  sourceName = "FGV";
  baseUrl = "https://conhecimento.fgv.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const html = await fetchDiscoveryPage(this.baseUrl, "/concursos", 10000);
    const $ = cheerio.load(html);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 8) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !isOfficialSourceUrl(this.baseUrl, url, /^\/concursos\/.+/i) || /nosso-portfolio/.test(new URL(url).pathname)) return;
      const title = $(el).text().trim().slice(0, 200);
      if (title.length < 8) return;
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: 1, sourceId: "" });
    });
    return docs;
  }
}

export class AOCPAdapter implements CollectorSourceAdapter {
  sourceName = "Instituto AOCP";
  baseUrl = "https://www.institutoaocp.org.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const html = await fetchDiscoveryPage(this.baseUrl, "/", 10000);
    const $ = cheerio.load(html);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 8) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !isOfficialSourceUrl(this.baseUrl, url, /^\/concursos\//i) || new URL(url).pathname.includes("/status/")) return;
      const title = $(el).text().trim().slice(0, 200);
      if (title.length < 8) return;
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: 1, sourceId: "" });
    });
    return docs;
  }
}

export function parseSourceLinks(html: string, source: { name: string; baseUrl: string; tier: number; path: RegExp }): DiscoveredDocument[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const documents: DiscoveredDocument[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = toAbs(source.baseUrl, href);
    if (!absolute) return;
    const url = new URL(absolute);
    if (!isOfficialSourceUrl(source.baseUrl, url.href, source.path)) return;
    url.hash = "";
    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (title.length < 8 || seen.has(url.href)) return;
    seen.add(url.href);
    documents.push({ sourceId: "", sourceName: source.name, source: source.name, sourceUrl: url.href, url: url.href,
      canonicalUrl: url.href, title: title.slice(0, 200), documentType: "HTML", documentTypeCandidate: "HTML", tier: source.tier,
      metadata: { discoveryOnly: source.tier !== 1, adapter: source.name } });
  });
  return documents.slice(0, 12);
}

export class FCCAdapter implements CollectorSourceAdapter {
  sourceName = "FCC";
  baseUrl = "https://www.concursosfcc.com.br";
  tier = 1;
  async discover() {
    return parseSourceLinks(await fetchDiscoveryPage(this.baseUrl, "/", 10000), { name: this.sourceName, baseUrl: this.baseUrl, tier: this.tier, path: /^\/concursos\/[^/]+\/index\.html$/i });
  }
}

export class CesgranrioAdapter implements CollectorSourceAdapter {
  sourceName = "Cesgranrio";
  baseUrl = "https://www.cesgranrio.org.br";
  tier = 1;
  async discover() {
    return parseSourceLinks(await fetchDiscoveryPage(this.baseUrl, "/concursos", 10000), { name: this.sourceName, baseUrl: this.baseUrl, tier: this.tier, path: /^\/concurso\/[^/]+\/?$/i });
  }
}

export class JCAdapter implements CollectorSourceAdapter {
  sourceName = "JC Concursos";
  baseUrl = "https://jcconcursos.com.br";
  tier = 2;
  async discover() {
    return parseSourceLinks(await fetchDiscoveryPage(this.baseUrl, "/concursos", 10000), { name: this.sourceName, baseUrl: this.baseUrl, tier: this.tier, path: /^\/(?:concurso|noticia\/concursos)\//i });
  }
}

const registered: CollectorSourceAdapter[] = [new CebraspeAdapter(), new FGVAdapter(), new FCCAdapter(), new CesgranrioAdapter(), new AOCPAdapter(), new DOUAdapter(), new PCIAdapter(), new JCAdapter()];
export const adapters: CollectorSourceAdapter[] = registered.map((adapter) => ({
  sourceName: adapter.sourceName, baseUrl: adapter.baseUrl, tier: adapter.tier,
  async discover() {
    return (await adapter.discover()).map((doc) => ({ ...doc, source: doc.sourceName, url: doc.sourceUrl,
      documentTypeCandidate: doc.documentType, metadata: { ...doc.metadata, adapter: adapter.sourceName, discoveryOnly: adapter.tier !== 1 } }));
  },
}));
