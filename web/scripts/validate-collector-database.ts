import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";
import { syncConcursoFromDocument } from "../src/lib/collector/syncConcurso";

async function main() {
  const { db, svc } = await createCollectorDatabase();
  try {
    const source = (await db.query<{ id: string }>("select id from collector_sources where name = 'FGV'")).rows[0];
    const documents = [
      { title: "Prefeitura de Exemplo Edital 01/2026", url: "https://conhecimento.fgv.br/concursos/exemplo2026", text: "100 vagas", date: "2026-01-01T00:00:00Z" },
      { title: "Prefeitura de Exemplo Retificação Edital 01/2026", url: "https://conhecimento.fgv.br/concursos/exemplo2026/retificacao.pdf", text: "Retificação do Edital 01/2026: 120 vagas", date: "2026-02-01T00:00:00Z" },
    ];
    const inputs = [];
    for (const doc of documents) {
      const inserted = await db.query<{ id: string }>("insert into collector_documents(source_id, canonical_url, source_url, title, raw_text, content_hash, status) values($1,$2,$2,$3,$4,md5($4),'PARSED') returning id", [source.id, doc.url, doc.title, doc.text]);
      inputs.push({ title: doc.title, canonicalUrl: doc.url, sourceName: "FGV", rawText: doc.text, documentId: inserted.rows[0].id, publishedAt: doc.date });
    }
    const extracted = { orgao: "Prefeitura de Exemplo", banca: "FGV", vagas: null, status: null };
    const original = await syncConcursoFromDocument(svc, inputs[0], extracted, 1);
    assert.ok(original?.created);
    const amendment = await syncConcursoFromDocument(svc, inputs[1], extracted, 1);
    assert.equal(amendment?.concursoId, original.concursoId);
    const snapshot = async () => {
      const counts: Record<string, number> = {};
      for (const table of ["concursos", "concurso_identity_aliases", "concurso_documents", "concurso_field_evidence", "concurso_changes", "concurso_duplicate_candidates"]) counts[table] = Number((await db.query<{ n: number }>(`select count(*) as n from ${table}`)).rows[0].n);
      return counts;
    };
    const first = await snapshot();
    for (const input of inputs) await syncConcursoFromDocument(svc, input, extracted, 1);
    const second = await snapshot();
    assert.deepEqual(second, first);
    const row = (await db.query<{ vagas: number; quality_status: string; hot_score: number; edital_url: string }>("select vagas, quality_status, hot_score, edital_url from concursos where id = $1", [original.concursoId])).rows[0];
    assert.equal(row.vagas, 120);
    assert.ok(row.hot_score > 0);
    assert.equal(row.edital_url, inputs[0].canonicalUrl);
    assert.notEqual(row.quality_status, "CONFLICTED");
    assert.equal((await db.query<{ relationship_type: string }>("select relationship_type from concurso_documents where collector_document_id = $1", [inputs[1].documentId])).rows[0].relationship_type, "RETIFICATION");
    await db.exec("set role anon;");
    assert.equal((await db.query("select id from concursos")).rows.length, 1);
    await db.exec("set role postgres;");
    await db.query("update concursos set quality_status = 'CONFLICTED' where id = $1", [original.concursoId]);
    await db.exec("set role anon;");
    assert.equal((await db.query("select id from concursos")).rows.length, 0);
    await assert.rejects(db.query("select persist_contest_document('{}'::jsonb)"), /permission denied/);
    await db.exec("set role postgres;");
    await db.query("update concursos set quality_status = $1 where id = $2", [row.quality_status, original.concursoId]);
    await assert.rejects(syncConcursoFromDocument(svc, { ...inputs[0], expectedContentHash: "stale-hash" }, extracted, 1), /DOCUMENT_VERSION_CHANGED/);
    const collisionBefore = await snapshot();
    const current = (await db.query<Record<string, unknown>>("select * from concursos where id = $1", [original.concursoId])).rows[0];
    await assert.rejects(db.query("select persist_contest_document($1::jsonb)", [JSON.stringify({
      contest_id: null, payload: current,
      document: { collector_document_id: inputs[0].documentId, source_url: inputs[0].canonicalUrl },
    })]), /CONTEST_CHANGED_RETRY/);
    assert.deepEqual(await snapshot(), collisionBefore);
    await db.query("update collector_documents set status = 'AI_PENDING' where id = $1", [inputs[0].documentId]);
    const firstClaim = (await db.query<{ ai_claim_token: string }>("select * from claim_ai_pending_documents(1)")).rows[0];
    assert.ok(firstClaim.ai_claim_token);
    await db.query("update collector_documents set ai_claimed_at = now() - interval '21 minutes' where id = $1", [inputs[0].documentId]);
    const secondClaim = (await db.query<{ ai_claim_token: string }>("select * from claim_ai_pending_documents(1)")).rows[0];
    assert.notEqual(secondClaim.ai_claim_token, firstClaim.ai_claim_token);
    await assert.rejects(syncConcursoFromDocument(svc, { ...inputs[0], claimToken: firstClaim.ai_claim_token }, extracted, 1), /DOCUMENT_CLAIM_CHANGED/);
    await assert.rejects(syncConcursoFromDocument(svc, inputs[0], extracted, 1), /DOCUMENT_CLAIM_CHANGED/);
    await syncConcursoFromDocument(svc, { ...inputs[0], claimToken: secondClaim.ai_claim_token }, extracted, 1);
    assert.deepEqual(await snapshot(), collisionBefore);
    const urlOnlyContest = (await db.query<{ id: string }>("insert into concursos(orgao,titulo,banca,edital_url,quality_status) values('Orgao URL','Concurso resolvido por URL','FGV','https://conhecimento.fgv.br/concursos/url-only-2026','PARTIAL') returning id")).rows[0];
    const urlOnlyDocument = (await db.query<{ id: string }>("insert into collector_documents(source_id,canonical_url,source_url,title,raw_text,content_hash,status) values($1,'https://conhecimento.fgv.br/concursos/url-only-2026','https://conhecimento.fgv.br/concursos/url-only-2026','Orgao URL Edital 99/2026','10 vagas','url-only','PARSED') returning id", [source.id])).rows[0];
    const urlOnlyResult = await syncConcursoFromDocument(svc, { title: "Orgao URL Edital 99/2026", canonicalUrl: "https://conhecimento.fgv.br/concursos/url-only-2026", sourceName: "FGV", rawText: "10 vagas", documentId: urlOnlyDocument.id }, { orgao: "Orgao URL", banca: "FGV", vagas: null, status: null }, 1);
    assert.equal(urlOnlyResult?.concursoId, urlOnlyContest.id, "official edital URL must resolve the existing canonical contest");
    const other = (await db.query<{ id: string }>("insert into concursos(orgao,titulo,quality_status) values('Outro','Outro concurso','PARTIAL') returning id")).rows[0];
    const pair = [original.concursoId, other.id].sort();
    await db.query("insert into concurso_duplicate_candidates(concurso_a_id,concurso_b_id,score,reason,status) values($1,$2,70,'fixture','POSSIBLE_DUPLICATE')", pair);
    await syncConcursoFromDocument(svc, inputs[0], extracted, 1);
    assert.equal((await db.query<{ is_publishable: boolean }>("select is_publishable from concursos where id = $1", [original.concursoId])).rows[0].is_publishable, false);
    const external = await db.query<{ id: string }>("insert into collector_documents(source_id, canonical_url, source_url, title, raw_text, content_hash, status) values($1,'https://evil.example/concursos/falso','https://evil.example/concursos/falso','Prefeitura de Exemplo Edital 01/2026','100 vagas','evil','PARSED') returning id", [source.id]);
    await assert.rejects(syncConcursoFromDocument(svc, { title: "Prefeitura de Exemplo Edital 01/2026", canonicalUrl: "https://evil.example/concursos/falso", sourceName: "FGV", rawText: "100 vagas", documentId: external.rows[0].id }, extracted, 1), /EVIDENCE_TIER_MISMATCH/);
    // Force a failure after the concurso update: all writes must roll back.
    await db.exec("alter table concurso_field_evidence add constraint fixture_reject_evidence check (field_name <> 'vagas') not valid;");
    const beforeFailure = await snapshot();
    await assert.rejects(syncConcursoFromDocument(svc, { ...inputs[1], rawText: "Retificação Edital 01/2026: 130 vagas", publishedAt: "2026-03-01T00:00:00Z" }, extracted, 1), /ATOMIC_PERSISTENCE/);
    assert.deepEqual(await snapshot(), beforeFailure);
    assert.equal((await db.query<{ vagas: number }>("select vagas from concursos where id = $1", [original.concursoId])).rows[0].vagas, 120);
    console.log(JSON.stringify({ database: "PostgreSQL/PGlite isolated", execution1: first, execution2: second, rollback: "passed", staleVersion: "rejected", logicalKeyCollision: "requires identity re-resolution", pendingDuplicate: "blocked", externalSource: "rejected" }));
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
