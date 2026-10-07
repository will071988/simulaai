import type { DiscoveredDocument } from "./types";
import { safeFetch, checkRobots } from "./http";
import * as cheerio from "cheerio";

export interface CollectorSourceAdapter {
  sourceName: string;
  baseUrl: string;
  documentOrigins?: string[];
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

async function fetchDiscoveryJson(baseUrl: string, path: string, timeoutMs: number): Promise<unknown> {
  const robots = await checkRobots(baseUrl, path);
  if (!robots.allowed) throw new CollectorDiscoveryError(robots.status || "ROBOTS_BLOCKED");
  const res = await safeFetch(new URL(path, baseUrl).toString(), { allowedTypes: ["application/json", "text/json"], timeoutMs, allowedOrigin: baseUrl });
  if (!res.ok || !res.text) throw new CollectorDiscoveryError(res.error || `HTTP_${res.status}`);
  try { return JSON.parse(res.text); } catch { throw new CollectorDiscoveryError("INVALID_JSON"); }
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

type CebraspeEvent = { slug: string; title: string };
export type CebraspeManifestEntry = CebraspeEvent & {
  contestUrl: string;
  officialTitle: string | null;
  status: string | null;
  registrationPeriod: string | null;
  roleCount: number;
  documents: DiscoveredDocument[];
};

export function parseCebraspeEvents(payload: unknown): CebraspeEvent[] {
  if (!Array.isArray(payload)) return [];
  const events: CebraspeEvent[] = [];
  const seen = new Set<string>();
  for (const group of payload) {
    if (!group || typeof group !== "object") continue;
    const record = group as Record<string, unknown>;
    if (typeof record.faseEvento === "string" && record.faseEvento.trim().toLocaleLowerCase("pt-BR") === "encerrados") continue;
    if (!Array.isArray(record.eventos)) continue;
    for (const item of record.eventos) {
      if (!item || typeof item !== "object") continue;
      const event = item as Record<string, unknown>;
      const slug = typeof event.eventoURL === "string" ? event.eventoURL.trim() : "";
      const title = typeof event.eventoNomeAbreviado === "string" ? event.eventoNomeAbreviado.trim() : "";
      if (!slug || !title || seen.has(slug)) continue;
      seen.add(slug);
      events.push({ slug, title });
    }
  }
  return events;
}

export function parseCebraspeDocuments(payload: unknown, event: CebraspeEvent): DiscoveredDocument[] {
  if (!payload || typeof payload !== "object") return [];
  const detail = payload as Record<string, unknown>;
  const contestUrl = new URL(`/concursos/${encodeURIComponent(event.slug)}`, "https://www.cebraspe.org.br").toString();
  const documents: DiscoveredDocument[] = [];
  const seen = new Set<string>();
  const append = (items: unknown, documentType: "EDITAL_PDF" | "PDF_GABARITO") => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const file = item as Record<string, unknown>;
      const fileName = typeof file.nomeArquivo === "string" ? file.nomeArquivo.trim() : "";
      const title = typeof file.descricaoArquivo === "string" ? file.descricaoArquivo.trim() : "";
      const sourceDate = typeof file.dataArquivoObj === "string" ? file.dataArquivoObj.trim() : "";
      const timestamp = /(?:z|[+-]\d{2}:\d{2})$/i.test(sourceDate) ? sourceDate : `${sourceDate}-03:00`;
      const publishedAt = sourceDate && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : undefined;
      const isPdf = fileName.toLowerCase().endsWith(".pdf") || (typeof file.tipoExtensaoArquivo === "string" && file.tipoExtensaoArquivo.toLowerCase().endsWith(".pdf"));
      if (!fileName || fileName.includes("/") || fileName.includes("\\") || !title || !isPdf) continue;
      const path = file.isGuid === true
        ? `/${encodeURIComponent(fileName)}`
        : `/concursos/${encodeURIComponent(event.slug)}/arquivos/${encodeURIComponent(fileName)}`;
      const url = new URL(path, "https://cdn.cebraspe.org.br").toString();
      if (seen.has(url)) continue;
      seen.add(url);
      documents.push({ sourceId: "", sourceName: "Cebraspe", sourceUrl: url, canonicalUrl: url, title: title.slice(0, 200), documentType, publishedAt, tier: 1, contestUrl, identityTitle: event.title });
    }
  };
  append(detail.arquivosEdital, "EDITAL_PDF");
  append(detail.arquivosGabarito, "PDF_GABARITO");
  return documents.sort((left, right) => (right.publishedAt || "").localeCompare(left.publishedAt || ""));
}

export async function discoverCebraspeManifest(limit = 12): Promise<CebraspeManifestEntry[]> {
  const apiBaseUrl = "https://apis.cebraspe.org.br";
  const events = parseCebraspeEvents(await fetchDiscoveryJson(apiBaseUrl, "/cebraspe/eventos/tipo/concursos/", 10000));
  const manifest: CebraspeManifestEntry[] = [];
  let lastError: unknown;
  for (const event of events.slice(0, limit)) {
    try {
      const detail = await fetchDiscoveryJson(apiBaseUrl, `/cebraspe/eventos/${encodeURIComponent(event.slug)}`, 10000);
      const documents = parseCebraspeDocuments(detail, event);
      const record = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
      manifest.push({
        ...event,
        contestUrl: new URL(`/concursos/${encodeURIComponent(event.slug)}`, "https://www.cebraspe.org.br").toString(),
        officialTitle: typeof record.eventoNomeCompleto === "string" ? record.eventoNomeCompleto.trim() || null : null,
        status: typeof record.eventoStatus === "string" ? record.eventoStatus.trim() || null : null,
        registrationPeriod: typeof record.periodoInscricao === "string" ? record.periodoInscricao.trim() || null : null,
        roleCount: Array.isArray(record.eventoCargos) ? record.eventoCargos.length : 0,
        documents,
      });
    } catch (error) { lastError = error; }
  }
  if (!manifest.length && lastError) throw lastError;
  return manifest;
}

export function selectCebraspeDocuments(manifest: CebraspeManifestEntry[]): DiscoveredDocument[] {
  const primary = manifest.flatMap((entry) => {
    const openingCandidates = entry.documents.filter((document) => /^edital\b.*\babertura\b/i.test(document.title));
    const opening = openingCandidates.find((document) => !/(?:retifica|atualiz|republica)/i.test(document.title))
      || openingCandidates.at(-1)
      || [...entry.documents].reverse().find((document) => document.documentType === "EDITAL_PDF");
    return opening || entry.documents[0] || [];
  });
  const primaryUrls = new Set(primary.map((document) => document.canonicalUrl));
  const updates = manifest.flatMap((entry) => entry.documents.find((document) => document.documentType === "EDITAL_PDF") || [])
    .filter((document) => !primaryUrls.has(document.canonicalUrl));
  return [...primary, ...updates];
}

export class CebraspeAdapter implements CollectorSourceAdapter {
  sourceName = "Cebraspe";
  baseUrl = "https://www.cebraspe.org.br";
  documentOrigins = [this.baseUrl, "https://cdn.cebraspe.org.br"];
  tier = 1;
  async discover(): Promise<DiscoveredDocument[]> {
    const manifest = await discoverCebraspeManifest(12);
    return selectCebraspeDocuments(manifest);
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
  sourceName: adapter.sourceName, baseUrl: adapter.baseUrl, documentOrigins: adapter.documentOrigins, tier: adapter.tier,
  async discover() {
    return (await adapter.discover()).map((doc) => ({ ...doc, source: doc.sourceName, url: doc.sourceUrl,
      documentTypeCandidate: doc.documentType, metadata: { ...doc.metadata, adapter: adapter.sourceName, discoveryOnly: adapter.tier !== 1 } }));
  },
}));
