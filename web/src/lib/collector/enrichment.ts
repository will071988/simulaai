import crypto from "crypto";

export type Evidence = { field: string; value: unknown; evidence: string; confidence: number };
export type Enriched = { orgao: string | null; banca: string | null; vagas: number | null; cadastro_reserva: number | null; salario: number | null; inscricao_inicio: string | null; inscricao_fim: string | null; prova_data: string | null; scope: string | null; state_code: string | null; city: string | null; location_label: string | null; cargos: string[]; escolaridade: string[]; evidence: Evidence[] };

const UFS: Record<string, string> = { AC: "AC", AL: "AL", AP: "AP", AM: "AM", BA: "BA", CE: "CE", DF: "DF", ES: "ES", GO: "GO", MA: "MA", MT: "MT", MS: "MS", MG: "MG", PA: "PA", PB: "PB", PR: "PR", PE: "PE", PI: "PI", RJ: "RJ", RN: "RN", RS: "RS", RO: "RO", RR: "RR", SC: "SC", SP: "SP", SE: "SE", TO: "TO", "RIO DE JANEIRO": "RJ", "SAO PAULO": "SP", "SÃO PAULO": "SP", BAHIA: "BA", "MINAS GERAIS": "MG" };
const lineFor = (text: string, re: RegExp) => text.split(/\r?\n/).find((line) => re.test(line))?.trim() || null;
const brDate = (v: string) => { const m = v.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const money = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

export function valueHash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function logicalKey(orgao: string, banca: string | null, title: string) { return `${orgao}|${banca || ""}|${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 100)}`; }

export function deterministicIdentity(title: string, sourceName: string): { orgao: string | null; banca: string | null } {
  const cleanTitle = title.replace(/\b20\d{2}\b/g, "").split(/\s+[|•-]\s+/)[0].trim();
  if (!cleanTitle || /^(para candidatos|contatos|publica[cç][oõ]es|avalia[cç][oõ]es|concursos|centros de pesquisa)$/i.test(cleanTitle) || !/(PF|PRF|INSS|BACEN|Transpetro|PC-[A-Z]{2}|concurso|edital|ag[eê]ncia|prefeitura|pol[ií]cia|tribunal|secretaria|universidade|instituto|banco|federal|estadual)/i.test(cleanTitle)) return { orgao: null, banca: null };
  const orgao = cleanTitle.slice(0, 100) || null;
  const knownBanca = ["Cebraspe", "FGV", "FCC", "Cesgranrio", "Instituto AOCP"].find((name) => sourceName.toLowerCase().includes(name.toLowerCase()));
  return { orgao, banca: knownBanca || null };
}

export function enrichDocument(title: string, text: string): Enriched {
  const cleanText = text.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/gi, " ").replace(/[ \t]+/g, " ");
  const all = `${title}\n${cleanText}`;
  const evidence: Evidence[] = [];
  const add = (field: string, value: unknown, re: RegExp, confidence = 0.9) => { const line = lineFor(all, re); if (value != null && line) evidence.push({ field, value, evidence: line.slice(0, 500), confidence }); };
  const vagasLine = lineFor(all, /\b\d{1,5}\s+vagas?\b/i); const vagas = vagasLine ? Number(vagasLine.match(/\b(\d{1,5})\s+vagas?/i)?.[1]) : null; add("vagas", vagas, /\b\d{1,5}\s+vagas?\b/i);
  const crLine = lineFor(all, /cadastro\s+(?:de\s+)?reserva|\bCR\b/i); const cadastro_reserva = crLine?.match(/\b(\d{1,5})\s+(?:vagas?\s+)?(?:para\s+)?(?:cadastro|CR)/i)?.[1]; add("cadastro_reserva", cadastro_reserva ? Number(cadastro_reserva) : null, /cadastro\s+(?:de\s+)?reserva|\bCR\b/i);
  const salaryLine = lineFor(all, /R\$\s*[\d.]+,\d{2}/i); const salaryRaw = salaryLine?.match(/R\$\s*([\d.]+,\d{2})/i)?.[1]; const salario = salaryRaw ? money(salaryRaw) : null; add("salario", salario, /R\$\s*[\d.]+,\d{2}/i);
  const dates = [...all.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)].map((m) => brDate(m[0])).filter(Boolean) as string[];
  const inscricaoLine = lineFor(all, /inscri/i); const inscricao_inicio = inscricaoLine ? brDate(inscricaoLine) : null; const inscricao_fim = inscricaoLine ? [...inscricaoLine.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)].map((m) => brDate(m[0]))[1] || null : null; add("inscricao_inicio", inscricao_inicio, /inscri/i); add("inscricao_fim", inscricao_fim, /inscri/i);
  const provaLine = lineFor(all, /\bprova(?:s)?\b/i); const prova_data = provaLine ? brDate(provaLine) : dates[0] || null; add("prova_data", prova_data, /\bprova(?:s)?\b/i);
  const ufMatch = all.match(/\b(?:PC|PM|TJ|SEFAZ)[- ]?([A-Z]{2})\b|\b(?:Estado do|Governo do Estado do)\s+([A-Za-zÀ-ÿ ]+)/i); const ufName = (ufMatch?.[1] || ufMatch?.[2] || "").trim().toUpperCase(); const state_code = UFS[ufName] || null;
  const cityMatch = all.match(/Prefeitura(?: Municipal)? de\s+([A-Za-zÀ-ÿ' -]{2,60})/i); const city = cityMatch?.[1]?.trim().replace(/\s+(?:concurso|edital).*$/i, "") || null;
  const locationText = `${title}\n${cleanText.split(/\r?\n/).filter((line) => /abrang|lota[cç][aã]o|local da vaga|prefeitura|estado do|\b(?:PC|PM|TJ|SEFAZ)[- ]?[A-Z]{2}\b/i.test(line)).join("\n")}`;
  let scope: string | null = null; if (/abrang[eê]ncia.{0,30}nacional|[aâ]mbito.{0,30}nacional|todo o territ[oó]rio nacional/i.test(locationText)) scope = "NACIONAL"; else if (city) scope = "MUNICIPAL"; else if (state_code) scope = "ESTADUAL";
  const location_label = city ? `${city} - abrangencia municipal` : state_code ? `${state_code} - abrangencia estadual` : scope === "NACIONAL" ? "Nacional - abrangencia nacional" : null;
  add("scope", scope, /nacional|Prefeitura|Estado do|\b(?:PC|PM|TJ|SEFAZ)[- ]?[A-Z]{2}\b/i, 0.85); add("state_code", state_code, /Estado do|\b(?:PC|PM|TJ|SEFAZ)[- ]?[A-Z]{2}\b/i, 0.85); add("city", city, /Prefeitura(?: Municipal)? de/i, 0.85);
  const cargos = [...all.matchAll(/(?:cargo(?:s)?|fun[cç][aã]o)\s*(?:de|:)?\s*([A-Za-zÀ-ÿ ]{3,70})/gi)].map((m) => m[1].trim()).filter((x, i, a) => x.length > 3 && a.indexOf(x) === i).slice(0, 8); if (cargos.length) add("cargos", cargos, /cargo(?:s)?|fun[cç][aã]o/i, 0.75);
  const escolaridade = ([[/ensino fundamental/i, "FUNDAMENTAL"], [/ensino m[eé]dio/i, "MEDIO"], [/t[eé]cnico/i, "TECNICO"], [/ensino superior|gradua[cç][aã]o/i, "SUPERIOR"]] as const).filter(([re]) => re.test(all)).map(([, level]) => level); if (escolaridade.length) add("escolaridade", escolaridade, /ensino|t[eé]cnico|gradua[cç][aã]o/i, 0.8);
  return { orgao: null, banca: null, vagas, cadastro_reserva: cadastro_reserva ? Number(cadastro_reserva) : null, salario, inscricao_inicio, inscricao_fim, prova_data, scope, state_code, city, location_label, cargos, escolaridade, evidence };
}
