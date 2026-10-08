import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deriveCollectorHealth } from "../src/lib/collector/health";
import { createCollectorMetrics, deriveCollectorRunStatus } from "../src/lib/collector/observability";
import { evaluateOperationalAlertRules } from "../src/lib/observability/alerts";
import { boundedNumber, publicHealthPayload, summarizeApiMetrics } from "../src/lib/observability/operations";

const now = Date.parse("2026-10-05T12:00:00Z");
const recent = new Date(now - 60 * 60 * 1000).toISOString();
assert.equal(deriveCollectorHealth({ lastRun: { status: "SUCCESS", finished_at: recent }, sourcesHealthy: 0, sourcesDegraded: 0, sourcesFailed: 0, pendingAI: 0, now }), "FAILED");
assert.equal(deriveCollectorRunStatus(createCollectorMetrics()), "FAILED");
assert.equal(boundedNumber("invalid", 20, 1, 100), 20);
assert.equal(boundedNumber("999", 20, 1, 100), 100);
const api = summarizeApiMetrics([{ request_count: 20, error_count: 2, latency_sum_ms: 4000, latency_max_ms: 900, latency_le_100: 5, latency_le_500: 19, latency_le_1000: 20, latency_le_3000: 20, latency_gt_3000: 0 }]);
assert.deepEqual(api, { requests: 20, errors: 2, errorRate: 0.1, averageLatencyMs: 200, maxLatencyMs: 900, p95UpperMs: 500 });
const quiet = evaluateOperationalAlertRules({ now, latestCollectorStatus: "SUCCESS", lastCollectorSuccessAt: recent, enabledTier1: 2, unhealthyTier1: 1, dueBacklog: 0, aiBudgetReserved: 50, aiBudgetLimit: 50, apiRequests: 19, apiErrors: 10, dbErrors: 2, pendingJobStatus: "SUCCESS", lastPendingJobAt: recent });
assert.deepEqual(quiet, [], "isolated degradation, errors below minimum sample and exhausted budget without backlog must not alert");
const alerts = evaluateOperationalAlertRules({ now, latestCollectorStatus: "FAILED", lastCollectorSuccessAt: new Date(now - 27 * 60 * 60 * 1000).toISOString(), enabledTier1: 2, unhealthyTier1: 2, dueBacklog: 5, oldestDueAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), aiBudgetReserved: 50, aiBudgetLimit: 50, apiRequests: 20, apiErrors: 2, dbErrors: 3, pendingJobStatus: "FAILED", lastPendingJobAt: recent });
assert.deepEqual(new Set(alerts.map((alert) => alert.fingerprint)), new Set(["COLLECTOR_FAILED", "COLLECTOR_STALE", "ALL_TIER1_UNHEALTHY", "AI_BACKLOG_DUE", "AI_BUDGET_EXHAUSTED", "API_5XX_RATE", "DATABASE_ERRORS", "PENDING_JOB_UNHEALTHY"]));
const nullScheduledBacklog = evaluateOperationalAlertRules({ now, latestCollectorStatus: "SUCCESS", lastCollectorSuccessAt: recent, enabledTier1: 1, unhealthyTier1: 0, dueBacklog: 5, oldestDueAt: null, aiBudgetReserved: 0, aiBudgetLimit: 50, apiRequests: 0, apiErrors: 0, dbErrors: 0, pendingJobStatus: "SUCCESS", lastPendingJobAt: recent });
assert.ok(nullScheduledBacklog.some((alert) => alert.fingerprint === "AI_BACKLOG_DUE"), "null-scheduled pending work is immediately due");

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? routeFiles(path) : entry === "route.ts" ? [path] : [];
  });
}
const routes = routeFiles("src/app/api");
assert.equal(routes.length, 20);
for (const route of routes) assert.match(readFileSync(route, "utf8"), /observeApiRoute\(/, `${route} must use bounded API instrumentation`);
const health = readFileSync("src/app/api/health/route.ts", "utf8");
for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "source_url", "error.message"]) assert.ok(!health.includes(forbidden), `public health must not expose ${forbidden}`);
assert.match(health, /"Cache-Control": "no-store"/);
assert.deepEqual(Object.keys(publicHealthPayload("HEALTHY")).sort(), ["ok", "status"]);
assert.deepEqual(publicHealthPayload("FAILED"), { ok: false, status: "unavailable" });
const adminPage = readFileSync("src/app/admin/operacoes/page.tsx", "utf8");
for (const label of ["API em 24h", "Backlog devido", "Jobs e crons", "Alertas operacionais", "Erros de runtime/banco"]) assert.ok(adminPage.includes(label));
console.log("Sprint 2.7 API metrics, health, jobs, backlog and selective alert rules passed");
