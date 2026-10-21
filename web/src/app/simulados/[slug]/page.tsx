import { notFound, redirect } from "next/navigation";

// Keep existing public links useful without serving the former demonstration bank.
const legacySlugs = new Set(["pf-cebraspe-01", "prf-cebraspe-01", "inss-fgv-01", "bacen-cesgranrio-01", "pcba-aocp-01", "transpetro-cesgranrio-01"]);

export default async function SimuladoSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!legacySlugs.has(slug)) notFound();
  redirect("/simulados?origem=trilha-anterior#gerador");
}
