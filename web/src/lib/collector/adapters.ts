import type { DiscoveredDocument } from "./types";
import { safeFetch, checkRobots } from "./http";
import * as cheerio from "cheerio";

export interface CollectorSourceAdapter {
  sourceName: string;
  baseUrl: string;
  tier: number;
  discover(): Promise<DiscoveredDocument[]>;
}

function toAbs(base: string, href: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

export class CebraspeAdapter implements CollectorSourceAdapter {
  sourceName = "Cebraspe";
  baseUrl = "https://www.cebraspe.org.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const robots = await checkRobots(this.baseUrl, "/concursos");
    if (!robots.allowed) return [];
    const res = await safeFetch(this.baseUrl + "/concursos", { allowedTypes: ["text/html"], timeoutMs: 10000 });
    if (!res.ok || !res.text) return [];
    const $ = cheerio.load(res.text);
    const docs: DiscoveredDocument[] = [];
    const seen = new Set<string>();
    $("a").each((_, el) => {
      if (docs.length >= 12) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !url.includes("/concursos/") || seen.has(url)) return;
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
    const robots = await checkRobots(this.baseUrl, "/web/dou");
    if (!robots.allowed) return [];
    const res = await safeFetch(this.baseUrl + "/web/dou/-/concurso", { allowedTypes: ["text/html"], timeoutMs: 8000 });
    if (!res.ok || !res.text) return [];
    const $ = cheerio.load(res.text);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 6) return false;
      const href = $(el).attr("href");
      if (!href || !href.includes("/web/dou")) return;
      const url = toAbs(this.baseUrl, href);
      if (!url) return;
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
    const robots = await checkRobots(this.baseUrl, "/");
    if (!robots.allowed) return [];
    const res = await safeFetch(this.baseUrl + "/concursos", { allowedTypes: ["text/html"], timeoutMs: 8000 });
    if (!res.ok || !res.text) return [];
    const $ = cheerio.load(res.text);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 6) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !url.includes("pciconcursos.com.br")) return;
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
    const robots = await checkRobots(this.baseUrl, "/concursos");
    if (!robots.allowed) return [];
    const res = await safeFetch(this.baseUrl + "/concursos", { allowedTypes: ["text/html"], timeoutMs: 10000 });
    if (!res.ok || !res.text) return [];
    const $ = cheerio.load(res.text);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 8) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || (!url.includes("/concursos") && !url.includes("fgv.br"))) return;
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
    const robots = await checkRobots(this.baseUrl, "/");
    if (!robots.allowed) return [];
    const res = await safeFetch(this.baseUrl, { allowedTypes: ["text/html"], timeoutMs: 10000 });
    if (!res.ok || !res.text) return [];
    const $ = cheerio.load(res.text);
    const docs: DiscoveredDocument[] = [];
    $("a").each((_, el) => {
      if (docs.length >= 8) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const url = toAbs(this.baseUrl, href);
      if (!url || !url.includes("institutoaocp.org.br")) return;
      const title = $(el).text().trim().slice(0, 200);
      if (title.length < 8) return;
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title, documentType: "HTML", tier: 1, sourceId: "" });
    });
    return docs;
  }
}

export const adapters: CollectorSourceAdapter[] = [new CebraspeAdapter(), new DOUAdapter(), new PCIAdapter(), new FGVAdapter(), new AOCPAdapter()];
