import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const base = (process.env.PERFORMANCE_BASE_URL || "https://simulaai-kappa.vercel.app").replace(/\/$/, "");
const samplesPerRoute = Number(process.env.PERFORMANCE_SAMPLES || 12);
const warmups = Number(process.env.PERFORMANCE_WARMUPS || 3);
const enforce = process.env.PERFORMANCE_ENFORCE !== "0";
const percentile = (sorted: number[], value: number) => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];

async function serviceContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !anonKey || !serviceKey) return { token: null, conflictId: null, revoke: async () => {} };
  const options = { auth: { autoRefreshToken: false, persistSession: false } } as const;
  const service = createClient(url, serviceKey, options);
  const admin = await service.from("ops_admin_members").select("user_id").limit(1).maybeSingle();
  assert.equal(admin.error, null, "admin lookup failed");
  if (!admin.data?.user_id) return { token: null, conflictId: null, revoke: async () => {} };
  const user = await service.auth.admin.getUserById(admin.data.user_id);
  assert.equal(user.error, null, "admin user lookup failed");
  assert.ok(user.data.user.email, "admin smoke user has no email");
  const link = await service.auth.admin.generateLink({ type: "magiclink", email: user.data.user.email });
  assert.equal(link.error, null, "admin magic link failed");
  assert.ok(link.data.properties?.hashed_token, "admin magic link has no token hash");
  const browser = createClient(url, anonKey, options);
  try {
    const session = await browser.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    assert.equal(session.error, null, "admin smoke session failed");
    assert.ok(session.data.session?.access_token, "admin smoke session has no access token");
    const conflict = await service.from("concursos").select("id").eq("quality_status", "CONFLICTED").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    assert.equal(conflict.error, null, "conflict lookup failed");
    return { token: session.data.session.access_token, conflictId: conflict.data?.id || null, revoke: async () => {
      const signedOut = await browser.auth.signOut({ scope: "local" });
      assert.equal(signedOut.error, null, "admin smoke session cleanup failed");
    } };
  } catch (error) {
    await browser.auth.signOut({ scope: "local" });
    throw error;
  }
}

async function contestId() {
  const response = await fetch(`${base}/api/concursos?page=1&perPage=1&sort=RECENTES`);
  assert.equal(response.status, 200, "contest discovery failed");
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const id = payload.data?.[0]?.id;
  assert.equal(typeof id, "string", "contest discovery returned no ID");
  return id as string;
}

async function measure(endpoint: { path: string; profile: string; token?: string | null; p95LimitMs: number; maxBytes: number }) {
  const samples: Array<{ totalMs: number; ttfbMs: number; bytes: number; status: number }> = [];
  let cold: { totalMs: number; ttfbMs: number; bytes: number; status: number } | null = null;
  let cacheControl: string | null = null;
  for (let index = 0; index < samplesPerRoute + warmups; index++) {
    const started = performance.now();
    const response = await fetch(`${base}${endpoint.path}`, {
      headers: {
        "accept-encoding": "identity",
        ...(endpoint.token ? { authorization: `Bearer ${endpoint.token}` } : {}),
      },
    });
    const headersAt = performance.now();
    const body = await response.arrayBuffer();
    const sample = { totalMs: performance.now() - started, ttfbMs: headersAt - started, bytes: body.byteLength, status: response.status };
    if (index === 0) cold = sample;
    if (index >= warmups) samples.push(sample);
    cacheControl = response.headers.get("cache-control");
  }
  const totals = samples.map((sample) => sample.totalMs).sort((left, right) => left - right);
  const ttfb = samples.map((sample) => sample.ttfbMs).sort((left, right) => left - right);
  const result = {
    path: endpoint.path,
    profile: endpoint.profile,
    samples: samples.length,
    cold: cold && { totalMs: Math.round(cold.totalMs), ttfbMs: Math.round(cold.ttfbMs), bytes: cold.bytes, status: cold.status },
    totalMs: { p50: Math.round(percentile(totals, 0.5)), p95: Math.round(percentile(totals, 0.95)), p99: Math.round(percentile(totals, 0.99)) },
    ttfbMs: { p50: Math.round(percentile(ttfb, 0.5)), p95: Math.round(percentile(ttfb, 0.95)), p99: Math.round(percentile(ttfb, 0.99)) },
    bytes: { min: Math.min(...samples.map((sample) => sample.bytes)), max: Math.max(...samples.map((sample) => sample.bytes)) },
    statuses: [...new Set(samples.map((sample) => sample.status))],
    cacheControl,
  };
  assert.deepEqual(result.statuses, [200], `${endpoint.path} returned a non-200 response`);
  if (enforce) {
    assert.ok(result.totalMs.p95 <= endpoint.p95LimitMs, `${endpoint.path} p95 ${result.totalMs.p95}ms exceeds ${endpoint.p95LimitMs}ms`);
    assert.ok(result.bytes.max <= endpoint.maxBytes, `${endpoint.path} payload ${result.bytes.max} exceeds ${endpoint.maxBytes}`);
  }
  return result;
}

async function main() {
  assert.ok(Number.isInteger(samplesPerRoute) && samplesPerRoute >= 10, "at least 10 measured samples are required");
  assert.ok(Number.isInteger(warmups) && warmups >= 1, "at least one warm-up is required");
  const context = await serviceContext();
  try {
    const id = await contestId();
    const endpoints = [
      { path: "/", profile: "PUBLIC_PAGE", p95LimitMs: 1500, maxBytes: 600 * 1024 },
      { path: "/dashboard", profile: "PRIVATE_SHELL", p95LimitMs: 1500, maxBytes: 600 * 1024 },
      { path: "/concursos", profile: "PUBLIC_PAGE", p95LimitMs: 1500, maxBytes: 600 * 1024 },
      { path: "/api/concursos?page=1&perPage=24&sort=RECENTES", profile: "PUBLIC_CACHEABLE", p95LimitMs: 1000, maxBytes: 100 * 1024 },
      { path: "/api/concursos/hot", profile: "PUBLIC_CACHEABLE", p95LimitMs: 1000, maxBytes: 100 * 1024 },
      { path: `/api/concursos/${id}`, profile: "PUBLIC_NO_STORE", p95LimitMs: 1500, maxBytes: 200 * 1024 },
      { path: `/concursos/${id}`, profile: "PUBLIC_DETAIL_PAGE", p95LimitMs: 1800, maxBytes: 600 * 1024 },
      { path: "/api/collector", profile: "PUBLIC_HEALTH", p95LimitMs: 1200, maxBytes: 10 * 1024 },
      { path: "/admin/operacoes", profile: "PRIVATE_SHELL", p95LimitMs: 1500, maxBytes: 600 * 1024 },
      ...(context.token ? [
        { path: "/api/progress", profile: "PRIVATE_NO_STORE", token: context.token, p95LimitMs: 1200, maxBytes: 200 * 1024 },
        { path: "/api/admin/operations", profile: "ADMIN_PRIVATE", token: context.token, p95LimitMs: 2500, maxBytes: 300 * 1024 },
        ...(context.conflictId ? [{ path: `/api/admin/operations/conflicts/${context.conflictId}`, profile: "ADMIN_PRIVATE", token: context.token, p95LimitMs: 1800, maxBytes: 300 * 1024 }] : []),
      ] : []),
    ];
    const results = [];
    for (const endpoint of endpoints) results.push(await measure(endpoint));
    console.log(JSON.stringify({ base, generatedAt: new Date().toISOString(), samplesPerRoute, warmups, authenticated: Boolean(context.token), results }, null, 2));
  } finally { await context.revoke(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Sprint 2.8 performance smoke failed"); process.exitCode = 1; });
