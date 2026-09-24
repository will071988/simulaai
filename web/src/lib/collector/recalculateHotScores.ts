import type { SupabaseClient } from "@supabase/supabase-js";
import { calcHotScoreWithReasons } from "./hotScore";

type ConcursoRow = {
  id: string;
  status: string | null;
  vagas: number | null;
  salario: number | null;
  prova_data: string | null;
  inscricao_inicio: string | null;
  inscricao_fim: string | null;
  created_at: string | null;
  merged_into_id: string | null;
};

export async function recalculateHotScores(svc: SupabaseClient): Promise<number> {
  const { data, error } = await svc.from("concursos").select("id,status,vagas,salario,prova_data,inscricao_inicio,inscricao_fim,created_at,merged_into_id").is("merged_into_id", null);
  if (error) throw new Error(`load concursos for hot score: ${error.message}`);

  let updated = 0;
  for (const row of (data || []) as ConcursoRow[]) {
    const hot = calcHotScoreWithReasons({
      status: row.status,
      vagas: row.vagas,
      salario: row.salario,
      prova_data: row.prova_data,
      inscricao_inicio: row.inscricao_inicio,
      inscricao_fim: row.inscricao_fim,
      updated_at: row.created_at,
    });
    const result = await svc.from("concursos").update({ hot_score: hot.score, hot_reasons: hot.reasons }).eq("id", row.id);
    if (result.error) throw new Error(`update hot score ${row.id}: ${result.error.message}`);
    updated++;
  }
  return updated;
}
