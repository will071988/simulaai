import { z } from "zod";

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
  state_code: z.string().length(2).nullable().optional(),
  city: z.string().nullable().optional(),
  status: z.string().nullable().transform((v) => (v ? v.slice(0, 30) : null)),
  evidence: z
    .object({
      orgao: z.string().optional(),
      banca: z.string().optional(),
      vagas: z.string().optional(),
      status: z.string().optional(),
      salario: z.string().optional(),
      prova_data: z.string().optional(),
      inscricao_inicio: z.string().optional(),
      inscricao_fim: z.string().optional(),
      cadastro_reserva: z.string().optional(),
      cargos: z.string().optional(),
      escolaridade: z.string().optional(),
      scope: z.string().optional(),
      state_code: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
});

export type ExtractConcurso = z.infer<typeof ExtractConcursoSchema>;
