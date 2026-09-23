export type PageValidation = { decision: "ACCEPT" | "MAYBE" | "REJECT"; score: number; signals: string[] };
export function validateContestPage(title: string, url: string, text: string): PageValidation {
  const value = `${title} ${url} ${text}`.toLowerCase(); const signals: string[] = []; let score = 0;
  const path = new URL(url, "https://invalid.local").pathname.toLowerCase();
  if (/\/status(?:\/|$)|\/cidades?\/?$|\/centro-oeste\/?$|\/publicacoes?\/?$|#tabs$/.test(path) || /^(contatos|publica[cç][oõ]es|avalia[cç][oõ]es|quem somos|localizar por cidade|centro-oeste)$/i.test(title.trim())) return { decision: "REJECT", score: 0, signals: ["generic-page"] };
  for (const word of ["edital", "inscri", "vagas", "cargo", "cronograma", "processo seletivo"]) if (value.includes(word)) { score++; signals.push(word); }
  if (/\.pdf(?:\?|$)/.test(value)) { score++; signals.push("pdf"); }
  for (const word of ["contatos", "publicaç", "avaliaç", "centros de pesquisa", "institucional", "quem somos", "serviços", "homepage"]) if (value.includes(word)) { score -= 2; signals.push(`-${word}`); }
  const specificUrl = /\/concursos\/[^/]+/.test(path) && !/\/concursos\/?$/.test(path);
  if (specificUrl) { score++; signals.push("specific-url"); }
  return { decision: score >= 2 && specificUrl ? "ACCEPT" : score === 1 ? "MAYBE" : "REJECT", score, signals };
}
