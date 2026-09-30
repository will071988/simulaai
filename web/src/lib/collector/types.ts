export type DiscoveredDocument = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  documentType: "EDITAL" | "NOTICE" | "PDF_PROVA" | "PDF_GABARITO" | "HTML" | "EDITAL_PDF";
  publishedAt?: string;
  tier: number;
  contestUrl?: string;
  identityTitle?: string;
  source?: string;
  url?: string;
  documentTypeCandidate?: string;
  metadata?: { discoveryOnly?: boolean; adapter?: string };
};

export type CollectorRunResult = {
  sourcesChecked: number;
  documentsFound: number;
  documentsNew: number;
  documentsUpdated: number;
  aiProcessed: number;
  aiPending: number;
  errors: number;
};
