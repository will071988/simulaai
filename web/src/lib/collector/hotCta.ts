export type HotCtaInput = { simulado_slug?: string | null; edital_url?: string | null };

export function getHotCta(input: HotCtaInput): { label: string; href: string } | null {
  if (input.simulado_slug) return { label: "Fazer simulado", href: `/simulados/${input.simulado_slug}` };
  if (input.edital_url) return { label: "Ver edital", href: input.edital_url };
  return null;
}
