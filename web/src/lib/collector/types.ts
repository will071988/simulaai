export type DiscoveredDocument = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  documentType: "EDITAL" | "NOTICE" | "PDF_PROVA" | "PDF_GABARITO" | "HTML" | "EDITAL_PDF";
  publishedAt?: string;
  tier: number;
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
