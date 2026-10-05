import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { contestSearchInput } from "@/lib/contest-search";
import { observeApiRoute } from "@/lib/observability/operations";

const clean = (value: string) => value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
type SearchResult = { data: unknown[]; total: number };

async function handleGET(request: Request) {
  const parsed = contestSearchInput(request.url);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID_CONTEST_SEARCH", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;
  const result = await supabase.rpc("search_public_contests", {
    p_q: input.q ? clean(input.q) : null, p_orgao: input.orgao ? clean(input.orgao) : null,
    p_cargo: input.cargo ? clean(input.cargo) : null, p_banca: input.banca ? clean(input.banca) : null,
    p_cidade: input.cidade ? clean(input.cidade) : null, p_estado: input.estado || null,
    p_nivel: input.nivel || null, p_status: input.status || null, p_abrangencia: input.abrangencia || null,
    p_salario_min: input.salarioMin ?? null, p_salario_max: input.salarioMax ?? null,
    p_inscricao: input.inscricao || null, p_sort: input.sort, p_page: input.page, p_per_page: input.perPage,
  });
  if (result.error) return NextResponse.json({ ok: false, error: "CONTEST_LIST_QUERY_FAILED" }, { status: 500 });
  const payload = result.data as SearchResult | null; const total = Number(payload?.total || 0);
  return NextResponse.json({ ok: true, data: payload?.data || [], meta: { page: input.page, perPage: input.perPage, total, totalPages: Math.ceil(total / input.perPage) } }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

export const GET = observeApiRoute("/api/concursos", handleGET);
