import assert from "node:assert/strict";
import { createCollectorDatabase } from "./support/collectorDatabase";

async function main() {
  const { db } = await createCollectorDatabase();
  try {
    const source = (await db.query<{ id: string; hostname: string; health_status: string }>("select id, hostname, health_status from collector_sources where name = 'FGV'")).rows[0];
    assert.equal(source.hostname, "conhecimento.fgv.br");
    assert.equal(source.health_status, "HEALTHY");
    assert.deepEqual((await db.query<{ name: string; enabled: boolean }>("select name, enabled from collector_sources where name in ('QConcursos','Folha Dirigida') order by name")).rows, [
      { name: "Folha Dirigida", enabled: false }, { name: "QConcursos", enabled: false },
    ]);
    await db.query("update collector_sources set failure_count = 3, last_status = 'FAILED' where id = $1", [source.id]);
    const degraded = (await db.query<{ enabled: boolean; health_status: string }>("select enabled, health_status from collector_sources where id = $1", [source.id])).rows[0];
    assert.equal(degraded.enabled, true, "failure threshold must not auto-disable a source");
    assert.equal(degraded.health_status, "DEGRADED");
    await assert.rejects(db.query("update collector_sources set enabled = false where id = $1", [source.id]), /CONTROLLED_DISABLE_METADATA_REQUIRED/);

    await assert.rejects(db.exec("insert into collector_sources(name,base_url,type,tier,source_type,adapter,health_status) values('Unreviewed','https://unreviewed.example','portal',3,'DISCOVERY_AUXILIAR','Unreviewed','HEALTHY')"), /SOURCE_APPROVAL_REQUIRED/);
    const candidate = (await db.query<{ id: string }>("insert into source_candidates(url,domain,reason,found_by,confidence,status,official_url,reviewed_at,reviewed_by) values('https://discovery.example/item','discovery.example','fixture','test',0.5,'APPROVED','https://approved.example',now(),'curator') returning id")).rows[0];
    await db.query("insert into collector_sources(name,base_url,type,tier,source_type,adapter,health_status,approved_candidate_id) values('Approved','https://approved.example','portal',3,'DISCOVERY_AUXILIAR','Approved','HEALTHY',$1)", [candidate.id]);
    assert.equal((await db.query<{ n: number }>("select count(*) as n from collector_sources where name = 'Approved' and enabled")).rows[0].n, 1);

    await db.query("update collector_sources set enabled = false, disabled_reason = 'fixture', disabled_by = 'curator', disabled_at = now() where id = $1", [source.id]);
    assert.equal((await db.query<{ health_status: string }>("select health_status from collector_sources where id = $1", [source.id])).rows[0].health_status, "DISABLED");
    console.log("Sprint 1.6 database governance tests passed");
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
