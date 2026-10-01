import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { contestSearchInput } from "@/lib/contest-search";

const fields = "id,orgao,titulo,banca,vagas,salario,status,edital_url,prova_data,created_at,inscricao_inicio,inscricao_fim,cadastro_reserva,cargos,escolaridade,scope,state_code,city,location_label,hot_score,hot_reasons,quality_status";
const clean = (value: string) => value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();

export async function GET(request: Request) {
  const parsed = contestSearchInput(request.url);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_CONTEST_SEARCH", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data; const today = new Date().toISOString().slice(0, 10); const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  let query = supabase.from("concursos").select(fields, { count: "exact" }).eq("is_publishable", true).is("merged_into_id", null);
  if (input.q) { const q = clean(input.q); query = query.or(`orgao.ilike.%${q}%,titulo.ilike.%${q}%,banca.ilike.%${q}%,city.ilike.%${q}%`); }
  if (input.orgao) query = query.ilike("orgao", `%${clean(input.orgao)}%`);
  if (input.banca) query = query.ilike("banca", `%${clean(input.banca)}%`);
  if (input.cidade) query = query.ilike("city", `%${clean(input.cidade)}%`);
  if (input.cargo) query = query.contains("cargos", [input.cargo]);
  if (input.estado) query = query.eq("state_code", input.estado);
  if (input.nivel) query = query.contains("escolaridade", [input.nivel]);
  if (input.status) query = query.eq("status", input.status);
  if (input.abrangencia) query = input.abrangencia === "FEDERAL" ? query.eq("scope", "NACIONAL") : query.eq("scope", input.abrangencia);
  if (input.salarioMin !== undefined) query = query.gte("salario", input.salarioMin);
  if (input.salarioMax !== undefined) query = query.lte("salario", input.salarioMax);
  if (input.inscricao === "ABERTA") query = query.lte("inscricao_inicio", today).gte("inscricao_fim", today);
  if (input.inscricao === "ENCERRANDO") query = query.gte("inscricao_fim", today).lte("inscricao_fim", soon);
  if (input.inscricao === "FUTURA") query = query.gt("inscricao_inicio", today);
  const order = { RECENTES: ["created_at", false], ENCERRANDO: ["inscricao_fim", true], SALARIO: ["salario", false], VAGAS: ["vagas", false], HOT: ["hot_score", false] } as const;
  const [column, ascending] = order[input.sort]; const from = (input.page - 1) * input.perPage;
  const result = await query.order(column, { ascending, nullsFirst: false }).range(from, from + input.perPage - 1);
  if (result.error) return NextResponse.json({ ok: false, error: "CONTEST_LIST_QUERY_FAILED" }, { status: 500 });
  const total = result.count || 0;
  return NextResponse.json({ ok: true, data: result.data || [], meta: { page: input.page, perPage: input.perPage, total, totalPages: Math.ceil(total / input.perPage) } }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
