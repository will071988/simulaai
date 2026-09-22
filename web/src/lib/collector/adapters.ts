import type { DiscoveredDocument } from "./types";
import { safeFetch, checkRobots } from "./http";

export interface CollectorSourceAdapter {
  sourceName: string;
  baseUrl: string;
  tier: number;
  discover(): Promise<DiscoveredDocument[]>;
}

// Cebraspe: discover via homepage scraping (deterministic parsing, no IA)
export class CebraspeAdapter implements CollectorSourceAdapter {
  sourceName = "Cebraspe";
  baseUrl = "https://www.cebraspe.org.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const allowed = await checkRobots(this.baseUrl, "/concursos");
    if (!allowed) return [];
    const res = await safeFetch(this.baseUrl + "/concursos", { allowedTypes: ["text/html"], timeoutMs: 10000 });
    if (!res.ok || !res.text) return [];
    // deterministic: extract links containing /concursos/ + PF/PRF keywords
    const docs: DiscoveredDocument[] = [];
    const re = /href="(\/concursos\/[^"]+)"[^>]*>([^<]{5,120})/gi;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = re.exec(res.text)) && docs.length < 10) {
      const path = m[1];
      const title = m[2].trim().replace(/\s+/g, " ");
      const url = new URL(path, this.baseUrl).toString();
      if (seen.has(url)) continue;
      seen.add(url);
      if (!/pf|prf|policia|inss|bacen|transpetro/i.test(title) && !/pf|prf/i.test(path)) continue;
      docs.push({
        sourceName: this.sourceName,
        sourceUrl: url,
        canonicalUrl: url,
        title: title.slice(0, 200),
        documentType: "HTML",
        tier: this.tier,
        sourceId: "",
      });
    }
    return docs;
  }
}

// DOU: simple RSS/HTML discovery (Tier 1)
// For MVP, fetch DOU concursos page (if reachable) or fallback to mock discovery that still persists provenience
export class DOUAdapter implements CollectorSourceAdapter {
  sourceName = "DOU";
  baseUrl = "https://www.in.gov.br";
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const res = await safeFetch(this.baseUrl + "/web/dou/-/concurso", { allowedTypes: ["text/html"], timeoutMs: 8000 });
    // Even if fetch fails, we still return empty but collector continues (DEGRADED_NO_AI handling)
    if (!res.ok || !res.text) return [];
    const docs: DiscoveredDocument[] = [];
    const re = /href="(\/web\/dou[^"]+)"[^>]*>([^<]{10,150})/gi;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(res.text)) && count < 5) {
      const url = new URL(m[1], this.baseUrl).toString();
      docs.push({ sourceName: this.sourceName, sourceUrl: url, canonicalUrl: url, title: m[2].trim().slice(0, 200), documentType: "HTML", tier: 1, sourceId: "" });
      count++;
    }
    return docs;
  }
}

// PCI Concursos Tier2 discovery
export class PCIAdapter implements CollectorSourceAdapter {
  sourceName = "PCI Concursos";
  baseUrl = "https://www.pciconcursos.com.br";
  tier = 2;
  async discover(): Promise<DiscoveredDocument[]> {
    const allowed = await checkRobots(this.baseUrl, "/");
    if (!allowed) return [];
    const res = await safeFetch(this.baseUrl + "/concursos", { allowedTypes: ["text/html"], timeoutMs: 8000 });
    if (!res.ok || !res.text) return [];
    const docs: DiscoveredDocument[] = [];
    const re = /href="(https:\/\/www\.pciconcursos\.com\.br\/[^"]+)"[^>]*>([^<]{10,120})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.text)) && docs.length < 5) {
      docs.push({ sourceName: this.sourceName, sourceUrl: m[1], canonicalUrl: m[1], title: m[2].trim().slice(0, 200), documentType: "HTML", tier: 2, sourceId: "" });
    }
    return docs;
  }
}

export const adapters: CollectorSourceAdapter[] = [new CebraspeAdapter(), new DOUAdapter(), new PCIAdapter()];
