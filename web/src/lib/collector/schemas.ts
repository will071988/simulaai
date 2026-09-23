import { z } from "zod";

export const ExtractConcursoSchema = z.object({
  orgao: z.string().nullable().transform((v) => (v ? v.slice(0, 100) : null)),
  banca: z.string().nullable().transform((v) => (v ? v.slice(0, 50) : null)),
  vagas: z.number().nullable(),
  salario: z.number().nullable().optional(),
  prova_data: z.string().nullable().optional(),
  inscricao_inicio: z.string().nullable().optional(),
  inscricao_fim: z.string().nullable().optional(),
  cadastro_reserva: z.number().nullable().optional(),
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
    })
    .optional(),
});

export type ExtractConcurso = z.infer<typeof ExtractConcursoSchema>;
