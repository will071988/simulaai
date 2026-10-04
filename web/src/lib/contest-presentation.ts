import { filterCurrentContestEvidence, hasOfficialFieldEvidence, type PublicDocument, type PublicEvidence } from "./contest-evidence";

type ContestInput = Record<string, unknown> & {
  id: string; titulo: string; orgao: string; status: string | null; updated_at: string;
  evidence: PublicEvidence[]; documents: PublicDocument[];
};
const siteUrl = "https://simulaai-kappa.vercel.app";
const forecastStatuses = new Set(["PREVISTO", "AUTORIZADO", "COMISSAO_FORMADA", "BANCA_DEFINIDA", "EDITAL_IMEINENTE", "EDITAL_IMINENTE"]);

/** The same factual policy feeds visible content, metadata and structured data. */
export function presentContest(contest: ContestInput) {
  const evidence = filterCurrentContestEvidence(contest, contest.evidence, contest.documents);
  const official = (field: string) => hasOfficialFieldEvidence(contest, evidence, field);
  const title = official("titulo") ? contest.titulo : "Concurso em verificação";
  const organization = official("orgao") ? contest.orgao : "Órgão não confirmado";
  const normalizedStatus = (contest.status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, "_");
  const forecast = forecastStatuses.has(normalizedStatus);
  const statusConfirmed = official("status");
  const badge = forecast ? (statusConfirmed ? "PREVISTO" : "PREVISÃO NÃO CONFIRMADA") : statusConfirmed ? "STATUS CONFIRMADO" : "STATUS NÃO CONFIRMADO";
  const description = `${title}. ${organization}. ${official("banca") ? `Banca ${contest.banca}. ` : ""}${official("vagas") ? `${contest.vagas} vagas. ` : ""}Consulte dados com evidência oficial, previsões e documentos.`;
  const location = official("location_label") ? String(contest.location_label) : ["city", "state_code", "scope"].filter(official).map((field) => String(contest[field])).join(" · ");
  const coordinatesConfirmed = typeof contest.latitude === "number" && Number.isFinite(contest.latitude) && Math.abs(contest.latitude) <= 90
    && typeof contest.longitude === "number" && Number.isFinite(contest.longitude) && Math.abs(contest.longitude) <= 180
    && official("latitude") && official("longitude");
  const canonical = `${siteUrl}/concursos/${contest.id}`;
  const jsonLd = {
    "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: canonical,
    dateModified: contest.updated_at, inLanguage: "pt-BR",
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Concursos", item: `${siteUrl}/concursos` },
      { "@type": "ListItem", position: 2, name: title, item: canonical },
    ] },
    citation: [...new Set(evidence.filter((item) => item.source_tier === 1).map((item) => item.source_url))],
  };
  return { official, title, organization, forecast, statusConfirmed, badge, description, location, coordinatesConfirmed, canonical, jsonLd, evidence };
}
