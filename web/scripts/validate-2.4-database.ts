import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const indexes = await db.query<{ indexname: string }>("select indexname from pg_indexes where tablename='concursos' and indexname like 'concursos_public_%' order by indexname");
    assert.ok(indexes.rows.length >= 9, "public search must have indexes for pagination, sorting and core filters");
    await db.exec(`insert into concursos(orgao,titulo,banca,vagas,salario,status,inscricao_inicio,inscricao_fim,prova_data,cargos,escolaridade,scope,state_code,city,is_publishable,hot_score,quality_status)
      values ('Órgão A','Concurso A','Banca X',10,5000,'INSCRICOES_ABERTAS','2026-09-01','2026-10-05','2026-12-01','["Analista"]',array['SUPERIOR'],'ESTADUAL','SP','São Paulo',true,9,'VERIFIED'),
             ('Órgão B','Concurso B','Banca Y',20,3000,'PREVISTO','2026-11-01','2026-12-01','2027-01-01','["Técnico"]',array['MEDIO'],'MUNICIPAL','RJ','Niterói',true,5,'VERIFIED'),
             ('Oculto','Não publicável','Banca Z',99,99000,'PREVISTO',null,null,null,'[]',array['SUPERIOR'],'NACIONAL',null,null,false,99,'UNVERIFIED'),
             ('PF','Polícia Federal','Cebraspe',30,12000,'PREVISTO',null,null,'2027-02-01','["Agente de Polícia"]',array['SUPERIOR'],'NACIONAL',null,null,true,12,'VERIFIED'),
             ('Empresa Nacional','Seleção nacional','Banca X',40,6000,'PREVISTO',null,null,'2027-03-01','["Analista Comercial"]',array['SUPERIOR'],'NACIONAL',null,null,true,7,'VERIFIED')`);
    const page = await db.query<{ titulo: string }>("select titulo from concursos where is_publishable and merged_into_id is null and state_code='SP' and salario>=4000 order by hot_score desc limit 1 offset 0");
    assert.deepEqual(page.rows, [{ titulo: "Concurso A" }]);
    const visible = await db.query<{ count: number }>("select count(*)::int count from concursos where is_publishable and merged_into_id is null");
    assert.equal(Number(visible.rows[0].count), 4, "unpublished contests must never enter search results");
    const fuzzyCargo = await db.query<{ result: { data: Array<{ orgao: string }>; total: number } }>("select search_public_contests(p_cargo => 'agente', p_page => 1, p_per_page => 1) result");
    assert.equal(Number(fuzzyCargo.rows[0].result.total), 1, "cargo filtering must be partial and case-insensitive");
    assert.equal(fuzzyCargo.rows[0].result.data[0].orgao, "PF");
    const federal = await db.query<{ result: { data: Array<{ orgao: string }>; total: number } }>("select search_public_contests(p_abrangencia => 'FEDERAL') result");
    assert.deepEqual(federal.rows[0].result.data.map((row) => row.orgao), ["PF"], "federal must not include every national contest");
    const qByCargo = await db.query<{ result: { total: number } }>("select search_public_contests(p_q => 'comercial') result");
    assert.equal(Number(qByCargo.rows[0].result.total), 1, "general search must include cargo names");
    const emptyLastPage = await db.query<{ result: { data: unknown[]; total: number } }>("select search_public_contests(p_page => 99, p_per_page => 1) result");
    assert.equal(emptyLastPage.rows[0].result.data.length, 0);
    assert.equal(Number(emptyLastPage.rows[0].result.total), 4, "total must remain accurate beyond the last page");
    assert.equal(Object.hasOwn(fuzzyCargo.rows[0].result.data[0], "raw_payload"), false, "RPC must only expose the public contest contract");
    console.log("Sprint 2.4 PostgreSQL public-only filtering, indexed ordering and bounded page query tests passed");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
