import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import type { ConflictDetail } from "../src/lib/admin/conflict-detail";

// This verifies the built client against isolated responses, never a real
// account or database. No user Chrome profile or production session is opened.
const origin = process.env.OPS_UI_FIXTURE_URL || "http://127.0.0.1:3026";
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || "";
const at = "2026-10-05T12:00:00Z";
const unknownId = "11111111-1111-4111-8111-111111111111";
const knownId = "22222222-2222-4222-8222-222222222222";
const conflictId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
type FixtureSource = { id: string; name: string; base_url: string; adapter: string | null; tier: number; enabled: boolean; disabled_reason: string | null; approved_candidate_id: string | null; health_status: string; failure_count: number; last_error_code: string | null; last_checked_at: string | null };
type FixtureCandidate = { id: string; url: string; domain: string; reason: string; confidence: number; status: string; official_url: string | null; review_notes: string | null; reviewed_at: string | null; operational_source: FixtureSource | null };

async function main() {
  assert.equal(new URL(origin).hostname, "127.0.0.1", "fixture may run only on loopback");
  assert.ok(executablePath, "BROWSER_EXECUTABLE_PATH is required");
  const browser = await chromium.launch({ executablePath, headless: true });
  const sources: FixtureSource[] = [{ id: "fgv-fixture", name: "FGV", base_url: "https://conhecimento.fgv.br", adapter: "FGV", tier: 1, enabled: false, disabled_reason: "CONTROLLED_DISABLE", approved_candidate_id: null, health_status: "DISABLED", failure_count: 4, last_error_code: "TIMEOUT", last_checked_at: at }];
  const candidates: FixtureCandidate[] = [
    { id: unknownId, url: "https://official.example/contest", domain: "official.example", reason: "Official page to review", confidence: 0.9, status: "CANDIDATE", official_url: null, review_notes: null, reviewed_at: null, operational_source: null },
    { id: knownId, url: "https://conhecimento.fgv.br/concursos/fixture", domain: "conhecimento.fgv.br", reason: "Known adapter", confidence: 1, status: "CANDIDATE", official_url: null, review_notes: null, reviewed_at: null, operational_source: null },
  ];
  const actions: { id: string; action: string; target_id: string; note: string; created_at: string }[] = [];
  const reviewAudit: ConflictDetail["audit"] = [];
  let latestReview: ConflictDetail["latestReview"] = { review_note: "Original note about divergent vacancies", reviewed_at: at, reviewed_by: actorId };
  let mismatch = false;
  const privateRequests: URL[] = [];
  const failures: string[] = [];
  const operations = () => ({
    runs: [], sources, aiPending: [], failedDocuments: [{ id: "failed-fixture", title: "Permanent failure", source_url: "https://official.example/contacts", status: "FAILED", ai_retry_count: 5, ai_last_error_code: "INSUFFICIENT_IDENTITY", retryable: false }],
    conflictedContests: [{ id: conflictId, titulo: "Concurso fixture", orgao: "Órgão fixture", quality_status: "CONFLICTED" }], duplicateCandidates: [], sourceCandidates: candidates.filter((item) => item.status === "CANDIDATE"), sourceHistory: candidates.filter((item) => item.status !== "CANDIDATE"),
    sourcePagination: { candidateOffset: 0, historyOffset: 0, limit: 50 }, knownAdapters: [{ name: "FGV", baseUrl: "https://conhecimento.fgv.br", tier: 1 }],
    counts: { sources: sources.length, aiPending: 0, failedDocuments: 1, conflictedContests: 1, duplicateCandidates: 0, sourceCandidates: candidates.filter((item) => item.status === "CANDIDATE").length, sourceHistory: candidates.filter((item) => item.status !== "CANDIDATE").length },
    invalidSchemas: 0, aiBudget: { day: "2026-10-05", reserved: 0, limit: 50 }, aiFailures: [], aiFailureCount7d: 0,
    conflictReviews: [{ concurso_id: conflictId, review_note: latestReview?.review_note, reviewed_at: at }], recentActions: actions,
    observability: { api: { requests: 10, errors: 0, errorRate: 0, averageLatencyMs: 50, maxLatencyMs: 100, p95UpperMs: 100 }, databaseErrors24h: 0, runtimeEvents24h: 0, recentEvents: [], jobs: [], backlog: { total: 0, due: 0, oldestDueAt: null }, ai24h: { calls: 0, success: 0, errors: 0, averageLatencyMs: 0 }, alerts: [] },
  });
  const detail = (url: URL): ConflictDetail => {
    const offset = Number(url.searchParams.get("evidenceOffset") || 0);
    const auditOffset = Number(url.searchParams.get("auditOffset") || 0);
    const page = (offset: number, total: number) => ({ offset, total, limit: 20, hasMore: offset + 20 < total });
    return {
      contest: { id: conflictId, titulo: "Concurso fixture", orgao: "Órgão fixture", quality_status: "CONFLICTED", is_publishable: false, updated_at: at },
      fields: [{ field_name: "vagas", current_value: 10, evidence: offset === 0 ? [
        { id: "original", value_json: 10, source_url: "https://official.example/original", source_name: "Official fixture", source_tier: 1, document_id: null, evidence_text: "The original notice offers 10 vacancies.", evidence_truncated: false, confidence: 1, observed_at: at, invalidation_reason: null, relation: "MATCHES_CURRENT" },
        { id: "divergent", value_json: 20, source_url: "https://official.example/second", source_name: "Second official fixture", source_tier: 1, document_id: null, evidence_text: "Another notice offers 20 vacancies.", evidence_truncated: false, confidence: 1, observed_at: at, invalidation_reason: null, relation: "DIFFERS_FROM_CURRENT" },
      ] : [{ id: "invalidated", value_json: 99, source_url: null, source_name: "Invalidated fixture", source_tier: 1, document_id: null, evidence_text: "Invalidated value kept for review.", evidence_truncated: false, confidence: 0.5, observed_at: at, invalidation_reason: "FIXTURE_INVALIDATION", relation: "INVALIDATED" }] }],
      documents: [{ id: "doc", collector_document_id: "collector-doc", document_type: "EDITAL_PDF", relationship_type: "ORIGINAL", source_url: "https://official.example/original", source_name: "Official document fixture", published_at: at, observed_at: at, is_current: true }],
      acceptedChanges: [{ id: "change", field_name: "vagas", old_value: 5, new_value: 10, source_url: "https://official.example/original", source_name: "Official change fixture", source_tier: 1, evidence_text: "Accepted change from 5 to 10.", evidence_truncated: false, observed_at: at, detected_at: at, relationship_type: "RETIFICATION" }],
      latestReview, audit: reviewAudit.slice(auditOffset, auditOffset + 20), decisionHistoryAvailable: false,
      pagination: { evidence: page(offset, 21), documents: page(0, 1), acceptedChanges: page(0, 1), audit: page(auditOffset, reviewAudit.length) },
    };
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  try {
    const session = { access_token: "fixture-only-not-a-real-token", refresh_token: "fixture-only", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: actorId, email: "operator@fixture.invalid", email_confirmed_at: at, is_anonymous: false, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: at } };
    await context.addInitScript((activeSession) => window.localStorage.setItem("sb-ukwulespvvthyjqgrjfo-auth-token", JSON.stringify(activeSession)), session);
    await context.route("**/*", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin) {
        if (url.hostname === "ukwulespvvthyjqgrjfo.supabase.co" && url.pathname === "/auth/v1/user") await route.fulfill({ json: session.user });
        else await route.abort();
        return;
      }
      if (url.pathname.startsWith("/api/admin/operations")) {
        assert.equal(request.headers().authorization, "Bearer fixture-only-not-a-real-token"); privateRequests.push(url);
        if (request.method() === "GET") await route.fulfill({ json: { ok: true, data: url.pathname.includes("/conflicts/") ? detail(url) : operations() } });
        else {
          const action = request.postDataJSON();
          assert.equal(action.actorId, undefined); assert.equal(typeof action.note, "string");
          if (action.action === "APPROVE_SOURCE") {
            const candidate = candidates.find((item) => item.id === action.targetId)!; assert.ok(candidate);
            if (action.activateKnownAdapter && mismatch) { await route.fulfill({ status: 409, json: { ok: false, error: "SOURCE_IDENTITY_MISMATCH" } }); return; }
            assert.equal(candidate.status === "REJECTED", false);
            if (candidate.status === "CANDIDATE") { candidate.review_notes = action.note; candidate.reviewed_at = at; }
            candidate.status = "APPROVED"; candidate.official_url = action.officialUrl;
            const source = candidate.id === knownId ? sources[0] : { id: "unknown-source", name: "Approved: official.example", base_url: "https://official.example", adapter: null, tier: 3, enabled: false, disabled_reason: "APPROVED_PENDING_ADAPTER", approved_candidate_id: unknownId, health_status: "DISABLED", failure_count: 0, last_error_code: null, last_checked_at: null };
            if (!sources.includes(source)) sources.push(source);
            if (action.activateKnownAdapter) { assert.equal(candidate.id, knownId); source.enabled = true; source.disabled_reason = null; source.health_status = source.failure_count >= 3 ? "DEGRADED" : "HEALTHY"; }
            candidate.operational_source = source;
            actions.unshift({ id: String(actions.length), action: action.action, target_id: candidate.id, note: action.note, created_at: at });
            await route.fulfill({ json: { ok: true, data: { source: { source_name: source.name, enabled: source.enabled, adapter: source.adapter } } } });
          } else {
            assert.equal(action.action, "REVIEW_CONFLICT"); assert.equal(action.targetId, conflictId);
            latestReview = { review_note: action.note, reviewed_at: at, reviewed_by: actorId };
            reviewAudit.unshift({ id: String(reviewAudit.length), action: "REVIEW_CONFLICT", note: action.note, created_at: at, actor_user_id: actorId });
            actions.unshift({ id: String(actions.length), action: action.action, target_id: conflictId, note: action.note, created_at: at });
            await route.fulfill({ json: { ok: true, data: {} } });
          }
        }
        return;
      }
      if (url.pathname.startsWith("/api/")) { await route.fulfill({ json: { ok: true, data: null } }); return; }
      await route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("dialog", (dialog) => void dialog.accept());
    assert.equal((await page.goto(`${origin}/admin/operacoes`, { waitUntil: "networkidle" }))?.status(), 200);
    await page.getByText("Saúde do coletor", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Retry indisponível" }).isDisabled(), true);
    const unknownCard = page.locator("article").filter({ has: page.getByText("official.example", { exact: true }) });
    await unknownCard.getByLabel("URL oficial para official.example").fill("https://official.example/contest");
    await unknownCard.getByLabel("Nota de revisão", { exact: true }).fill("Official fixture checked");
    assert.equal(await unknownCard.getByRole("button", { name: "Aprovar e ativar adaptador", exact: true }).count(), 0);
    await unknownCard.getByRole("button", { name: "Aprovar fonte", exact: true }).click();
    await page.getByText(/fonte registrada e desativada; aguarda implementação de adaptador/).waitFor();
    await page.getByText(/Destino: Approved: official.example/).waitFor();
    assert.equal(candidates[0].operational_source?.enabled, false);

    const knownCard = page.locator("article").filter({ has: page.getByText("conhecimento.fgv.br", { exact: true }) });
    await knownCard.getByLabel("URL oficial para conhecimento.fgv.br").fill(candidates[1].url);
    await knownCard.getByLabel("Nota de revisão", { exact: true }).fill("Initial known source review");
    await knownCard.getByRole("button", { name: "Aprovar fonte", exact: true }).click();
    await knownCard.getByRole("button", { name: "Ativar adaptador conhecido", exact: true }).waitFor();
    assert.equal(sources[0].enabled, false);
    await knownCard.getByLabel("Nota de registro ou ativação").fill("Explicit activation reviewed");
    mismatch = true;
    await knownCard.getByRole("button", { name: "Ativar adaptador conhecido", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "A fonte cadastrada não corresponde" }).waitFor();
    assert.equal(sources[0].enabled, false);
    mismatch = false;
    await knownCard.getByRole("button", { name: "Ativar adaptador conhecido", exact: true }).click();
    await page.getByText(/FGV: fonte ativa; a coleta ocorre no próximo ciclo/).waitFor();
    assert.equal(sources[0].failure_count, 4);
    assert.equal(sources[0].health_status, "DEGRADED");
    assert.equal(candidates[1].review_notes, "Initial known source review");

    await page.getByRole("button", { name: "Ver evidências e revisar", exact: true }).click();
    await page.getByText("Diverge do valor atual: 20", { exact: true }).waitFor();
    await page.getByText(/Última nota .*Original note about divergent vacancies/).waitFor();
    assert.equal(await page.getByRole("link", { name: "Second official fixture", exact: true }).getAttribute("href"), "https://official.example/second");
    await page.getByRole("navigation", { name: "Páginas de evidências" }).getByRole("button", { name: "Próximos" }).click();
    await page.getByText("Evidência invalidada: 99", { exact: true }).waitFor();
    const paged = privateRequests.findLast((url) => url.pathname.includes("/conflicts/"))!;
    assert.equal(paged.searchParams.get("evidenceOffset"), "20"); assert.equal(paged.searchParams.get("documentsOffset"), "0"); assert.equal(paged.searchParams.get("changesOffset"), "0"); assert.equal(paged.searchParams.get("auditOffset"), "0");
    await page.getByLabel("Nota da revisão do conflito").fill("Reviewed discrepancy; await official correction");
    await page.getByRole("button", { name: "Registrar revisão", exact: true }).click();
    await page.getByRole("button", { name: "Ver evidências e revisar", exact: true }).click();
    await page.getByText(/Última nota .*Reviewed discrepancy; await official correction/).waitFor();
    assert.equal(detail(new URL(`${origin}/api/admin/operations/conflicts/${conflictId}`)).contest.is_publishable, false);
    const artifact = join(mkdtempSync(join(tmpdir(), "simulaai-ops-ui-")), "conflict-review.png");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: artifact, fullPage: true });
    assert.deepEqual(failures, []);
    console.log(JSON.stringify({ ok: true, isolated: true, productionSessionUsed: false, sourceApproval: true, explicitActivation: true, mismatchRejected: true, conflictEvidence: true, independentPagination: true, reviewReload: true, screenshot: artifact }));
  } finally { await context.close(); await browser.close(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Isolated operations UI fixture failed"); process.exitCode = 1; });
