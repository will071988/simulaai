import { z } from "zod";

const optional = z.string().trim().max(120).optional().transform((value) => value || undefined);
export const ContestSearchSchema = z.object({
  q: optional, orgao: optional, cargo: optional, banca: optional, cidade: optional,
  estado: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  nivel: z.enum(["FUNDAMENTAL", "MEDIO", "TECNICO", "SUPERIOR"]).optional(), status: optional,
  abrangencia: z.enum(["NACIONAL", "MUNICIPAL", "ESTADUAL", "FEDERAL"]).optional(),
  salarioMin: z.coerce.number().min(0).max(1_000_000).optional(), salarioMax: z.coerce.number().min(0).max(1_000_000).optional(),
  inscricao: z.enum(["ABERTA", "ENCERRANDO", "FUTURA"]).optional(),
  sort: z.enum(["RECENTES", "ENCERRANDO", "SALARIO", "VAGAS", "HOT"]).default("RECENTES"),
  page: z.coerce.number().int().min(1).max(10_000).default(1), perPage: z.coerce.number().int().min(1).max(50).default(24),
}).strict().refine((value) => value.salarioMin === undefined || value.salarioMax === undefined || value.salarioMin <= value.salarioMax, { message: "INVALID_SALARY_RANGE" });

export function contestSearchInput(url: string) { return ContestSearchSchema.safeParse(Object.fromEntries(new URL(url).searchParams.entries())); }
