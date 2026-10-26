import { isProceduralRole, isSchoolingCategory } from "../contest-role";

export function extractLabeledRoles(text: string): Array<{ value: string; excerpt: string }> {
  // PDF line wraps are whitespace, not the end of a labelled role. Require a
  // separator so ordinary mentions such as "cargo ao qual" cannot match.
  const source = text.replace(/\s+/g, " ").trim();
  const roles: Array<{ value: string; excerpt: string }> = [];
  for (const match of source.matchAll(/\b(?:cargos?|fun[cç][aã]o)\s*(?:\d+\s*)?(?::\s*|de\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ /–—-]*)/gi)) {
    const value = match[1].replace(/\s+QPBM\/?$/i, "").replace(/[\s–—-]+$/g, "").trim();
    if (value.length < 4 || value.length > 120 || isSchoolingCategory(value) || isProceduralRole(value)) continue;
    if (roles.some(role => role.value.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) continue;
    roles.push({ value, excerpt: match[0].slice(0, match[0].indexOf(match[1]) + value.length) });
  }
  return roles;
}
