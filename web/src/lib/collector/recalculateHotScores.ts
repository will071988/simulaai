import type { SupabaseClient } from "@supabase/supabase-js";
import { calcHotScore } from "./hotScore";

type ConcursoRow = {
  id: string;
  status: string | null;
  vagas: number | null;
  salario: number | null;
  prova_data: string | null;
  created_at: string | null;
};

export async function recalculateHotScores(svc: SupabaseClient): Promise<number> {
  const { data, error } = await svc.from("concursos").select("id,status,vagas,salario,prova_data,created_at");
  if (error) throw new Error(`load concursos for hot score: ${error.message}`);

  let updated = 0;
  for (const row of (data || []) as ConcursoRow[]) {
    const hotScore = calcHotScore({
      status: row.status,
      vagas: row.vagas,
      salario: row.salario,
      prova_data: row.prova_data,
      updated_at: row.created_at,
    });
    const result = await svc.from("concursos").update({ hot_score: hotScore }).eq("id", row.id);
    if (result.error) throw new Error(`update hot score ${row.id}: ${result.error.message}`);
    updated++;
  }
  return updated;
}
