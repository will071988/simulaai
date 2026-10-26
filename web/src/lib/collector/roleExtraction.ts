import { isProceduralRole, isSchoolingCategory } from "../contest-role";

export function extractLabeledRoles(text: string): Array<{ value: string; excerpt: string }> {
  // PDF line wraps are whitespace, not the end of a labelled role. Require a
  // separator so ordinary mentions such as "cargo ao qual" cannot match.
  const source = text.replace(/\s+/g, " ").trim();
  const roles: Array<{ value: string; excerpt: string }> = [];
  const labels = [...source.matchAll(/\b(?:cargos?|fun[cç][aã]o)\s*(?:\d+\s*)?(?::\s*|de\s+)/gi)];
  for (const [index, label] of labels.entries()) {
    const start = label.index! + label[0].length;
    const content = source.slice(start, labels[index + 1]?.index ?? source.length);
    const name = content.match(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ /–—-]*/)?.[0] || "";
    const value = name.replace(/\s+QPBM\/?$/i, "").replace(/[\s–—-]+$/g, "").trim();
    if (value.length < 4 || value.length > 120 || isSchoolingCategory(value) || isProceduralRole(value)) continue;
    if (roles.some(role => role.value.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) continue;
    roles.push({ value, excerpt: source.slice(label.index, start + value.length) });
  }
  return roles;
}
