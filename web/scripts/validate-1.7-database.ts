import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const published = await db.query<{ quality_status: string; origem: string }>("select quality_status, origem from questoes order by disciplina");
    assert.equal(published.rows.length, 2);
    assert.ok(published.rows.every((row) => row.quality_status === "PUBLISHED" && row.origem === "QUESTAO_AUTORAL"));

    const base = {
      disciplina: "Língua Portuguesa", assunto: "Interpretação", enunciado: "Em um texto informativo, qual alternativa descreve adequadamente a ideia central apresentada pelo autor?",
      alternativas: JSON.stringify([{ key: "A", text: "O tema recorrente que organiza os argumentos", isCorrect: true }, { key: "B", text: "Um detalhe isolado sem relação com o conjunto" }]),
      resposta: "A", explicacao: "A alternativa A identifica o tema recorrente que organiza os argumentos apresentados no texto.",
    };
    await assert.rejects(db.query("insert into questoes(disciplina,assunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,source_type,quality_status) values($1,$2,$3,$4::jsonb,$5,$6,'MEDIO','QUESTAO_AUTORAL','OWN_CONTENT','PUBLISHED')", [base.disciplina, base.assunto, base.enunciado, base.alternativas, base.resposta, base.explicacao]), /QUESTION_MUST_START_AS_DRAFT/);
    await assert.rejects(db.query("insert into questoes(disciplina,assunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,source_type) values($1,$2,$3,$4::jsonb,$5,$6,'MEDIO','QUESTAO_AUTORAL','OWN_CONTENT')", [base.disciplina, base.assunto, base.enunciado, JSON.stringify([{ key: "A", text: "Duplicada" }, { key: "B", text: "Duplicada" }]), base.resposta, base.explicacao]), /QUESTION_DUPLICATE_ALTERNATIVE/);
    await assert.rejects(db.query("insert into questoes(disciplina,assunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,banca,source_type) values($1,$2,$3,$4::jsonb,$5,$6,'MEDIO','QUESTAO_IA','FGV','AI_GENERATED')", [base.disciplina, base.assunto, base.enunciado, base.alternativas, base.resposta, base.explicacao]), /AI_QUESTION_CANNOT_CLAIM_OFFICIAL_BANK/);

    const draft = (await db.query<{ id: string }>("insert into questoes(disciplina,assunto,enunciado,alternativas,resposta_correta,explicacao,dificuldade,origem,source_type) values($1,$2,$3,$4::jsonb,$5,$6,'MEDIO','QUESTAO_AUTORAL','OWN_CONTENT') returning id", [base.disciplina, base.assunto, base.enunciado, base.alternativas, base.resposta, base.explicacao])).rows[0];
    await assert.rejects(db.query("update questoes set quality_status='VALIDATED' where id=$1", [draft.id]), /QUESTION_VALIDATION_REQUIRED/);
    await db.query("update questoes set quality_status='VALIDATED', validated_at=now(), validated_by='fixture', validation_errors='[]' where id=$1", [draft.id]);
    await db.query("update questoes set quality_status='PUBLISHED' where id=$1", [draft.id]);
    await db.exec("set role anon");
    assert.equal((await db.query<{ n: number }>("select count(*) as n from questoes")).rows[0].n, 3);
    await assert.rejects(db.query("delete from questoes where id=$1", [draft.id]), /permission denied/);
    console.log("Sprint 1.7 PostgreSQL quality gate and published-only RLS tests passed");
  } finally {
    await db.exec("set role postgres").catch(() => undefined);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
