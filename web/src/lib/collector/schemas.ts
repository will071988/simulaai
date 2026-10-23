import { z } from "zod";

export const BRAZILIAN_STATE_CODES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
const EvidenceQuoteSchema = z.union([z.string(), z.array(z.string()).min(1).max(4)]);

export const ExtractConcursoSchema = z.object({
  orgao: z.string().nullable().transform((v) => (v ? v.slice(0, 100) : null)),
  banca: z.string().nullable().transform((v) => (v ? v.slice(0, 50) : null)),
  vagas: z.number().int().nonnegative().nullable(),
  salario: z.number().nonnegative().nullable().optional(),
  prova_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  inscricao_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  inscricao_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cadastro_reserva: z.number().int().nonnegative().nullable().optional(),
  cargos: z.array(z.string()).optional(),
  escolaridade: z.array(z.enum(["FUNDAMENTAL", "MEDIO", "TECNICO", "SUPERIOR"])).optional(),
  scope: z.enum(["NACIONAL", "ESTADUAL", "MUNICIPAL", "REGIONAL"]).nullable().optional(),
  state_code: z.enum(BRAZILIAN_STATE_CODES).nullable().optional(),
  city: z.string().nullable().optional(),
  status: z.string().nullable().transform((v) => (v ? v.slice(0, 30) : null)),
  evidence: z
    .object({
      orgao: EvidenceQuoteSchema.optional(),
      banca: EvidenceQuoteSchema.optional(),
      vagas: EvidenceQuoteSchema.optional(),
      status: EvidenceQuoteSchema.optional(),
      salario: EvidenceQuoteSchema.optional(),
      prova_data: EvidenceQuoteSchema.optional(),
      inscricao_inicio: EvidenceQuoteSchema.optional(),
      inscricao_fim: EvidenceQuoteSchema.optional(),
      cadastro_reserva: EvidenceQuoteSchema.optional(),
      cargos: EvidenceQuoteSchema.optional(),
      escolaridade: EvidenceQuoteSchema.optional(),
      scope: EvidenceQuoteSchema.optional(),
      state_code: EvidenceQuoteSchema.optional(),
      city: EvidenceQuoteSchema.optional(),
    })
    .optional(),
});

export type ExtractConcurso = z.infer<typeof ExtractConcursoSchema>;
