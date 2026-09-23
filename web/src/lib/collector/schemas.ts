import { z } from "zod";

export const ExtractConcursoSchema = z.object({
  orgao: z.string().nullable().transform((v) => (v ? v.slice(0, 100) : null)),
  banca: z.string().nullable().transform((v) => (v ? v.slice(0, 50) : null)),
  vagas: z.number().nullable(),
  salario: z.number().nullable().optional(),
  prova_data: z.string().nullable().optional(),
  status: z.string().nullable().transform((v) => (v ? v.slice(0, 30) : null)),
  evidence: z
    .object({
      orgao: z.string().optional(),
      banca: z.string().optional(),
      vagas: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
});

export type ExtractConcurso = z.infer<typeof ExtractConcursoSchema>;
