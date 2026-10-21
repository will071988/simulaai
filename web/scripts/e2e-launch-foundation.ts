import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { createQuestionBankFixture } from "./support/questionBankFixture";
import { publishStarterBank } from "../src/lib/questions/publish-starter";

const require = createRequire(import.meta.url);
const learner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
const base = "http://127.0.0.1:3108";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const token = (id: string) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: expiresAt })).toString("base64url")}.fixture-signature`;

async function main() {
  const { db, service, transport } = await createQuestionBankFixture();
  await db.exec("create table ops_admin_members(user_id uuid primary key, role text not null)");
  for (const id of [learner, other, admin]) await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@fixture.test`]);
  await db.query("insert into ops_admin_members values($1,'ADMIN')", [admin]);
  await publishStarterBank(service, admin);
  const fixture = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*"); response.setHeader("Access-Control-Allow-Headers", "*"); response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    try {
      if (url.pathname === "/auth/v1/user") {
        const id = [learner, other, admin].find((candidate) => request.headers.authorization === `Bearer ${token(candidate)}`);
        if (!id) { response.writeHead(401); response.end('{"message":"invalid fixture session"}'); return; }
        response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ id, email: `${id}@fixture.test`, aud: "authenticated", role: "authenticated", is_anonymous: false, email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: {}, user_metadata: {} })); return;
      }
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const result = await transport(url.toString(), { method: request.method, headers: Object.fromEntries(Object.entries(request.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")), ...(body ? { body } : {}) });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500); response.end('{"message":"fixture request failed"}'); }
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address(); assert.ok(address && typeof address !== "string");
  const fixtureUrl = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", "3108"], { cwd: process.cwd(), env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixtureUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-only", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", AI_ENABLED: "false", COLLECTOR_ENABLED: "false", STRIPE_LIVEMODE: "false", NEXT_PUBLIC_SITE_URL: base, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16000); }); child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  try {
    let ready = false;
    for (let count = 0; count < 120; count++) { try { const response = await fetch(`${base}/api/simulados/generate`); if (response.ok) { ready = true; break; } } catch {} await new Promise((resolve) => setTimeout(resolve, 500)); }
    assert.ok(ready, `local fixture server unavailable: ${output.slice(-3000)}`);
    assert.equal((await fetch(`${base}/api/admin/content/starter`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/api/admin/content/starter`, { method: "POST", headers: { authorization: `Bearer ${token(learner)}` } })).status, 403);
    assert.equal((await fetch(`${base}/api/admin/content/starter`, { method: "POST", headers: { authorization: `Bearer ${token(admin)}`, "content-type": "application/json" }, body: "{}" })).status, 400);
    const published = await fetch(`${base}/api/admin/content/starter`, { method: "POST", headers: { authorization: `Bearer ${token(admin)}`, "content-type": "application/json" }, body: JSON.stringify({ action: "PUBLISH_STARTER_BANK", revision: "fundamentos-v1" }) });
    assert.equal(published.status, 200); assert.equal((await published.json()).data.alreadyPublished, 30);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("https://**.supabase.co/**", (route) => route.abort());
    await context.addInitScript(({ userId, accessToken }) => { localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: accessToken, refresh_token: "fixture-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: { id: userId, email: `${userId}@fixture.test`, aud: "authenticated", app_metadata: {}, user_metadata: {} } })); }, { userId: learner, accessToken: token(learner) });
    const page = await context.newPage();
    await page.goto(`${base}/simulados/pf-cebraspe-01`);
    await page.waitForURL("**/simulados?origem=trilha-anterior#gerador");
    await page.getByRole("button", { name: "Iniciar simulado", exact: true }).waitFor();
    await page.getByRole("combobox", { name: /^Disciplina/ }).selectOption("Matemática");
    const generated = page.waitForResponse((response) => response.url().endsWith("/api/simulados/generate") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Iniciar simulado", exact: true }).click();
    const response = await generated; assert.equal(response.status(), 201);
    const payload = await response.json(); assert.equal(payload.data.questions.length, 3);
    assert.doesNotMatch(JSON.stringify(payload.data.questions), /resposta_correta|gabarito|isCorrect|correctAnswer/);
    const ids = payload.data.questions.map((question: { id: string }) => question.id);
    const answers = await db.query<{ id: string; resposta_correta: string }>("select id,resposta_correta from questoes where id = any($1::uuid[])", [ids]);
    for (let index = 0; index < payload.data.questions.length; index++) {
      const question = payload.data.questions[index]; const correct = answers.rows.find((row) => row.id === question.id)!.resposta_correta;
      const selected = question.alternativas.find((alternative: { key: string }) => index === 0 ? alternative.key !== correct : alternative.key === correct);
      await page.locator(`input[name="${question.id}"]`).nth(question.alternativas.indexOf(selected)).check();
    }
    await page.getByRole("button", { name: "Finalizar e receber nota" }).click();
    await page.getByText("66.67%", { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByText("Explicação assistida validada", { exact: true }).count() + await page.getByText("Comentário autoral validado", { exact: true }).count(), 3);
    await page.getByRole("link", { name: "Ver meu histórico" }).click();
    await page.getByRole("heading", { name: "Seu progresso" }).waitFor();
    const progress = await page.evaluate(async () => { const session = JSON.parse(localStorage.getItem("sb-127-auth-token") || "{}"); const response = await fetch("/api/progress", { headers: { authorization: `Bearer ${session.access_token}` } }); return response.json(); });
    assert.equal(progress.data.summary.attempts, 1); assert.equal(progress.data.summary.correctAnswers, 2);
    const otherProgress = await fetch(`${base}/api/progress`, { headers: { authorization: `Bearer ${token(other)}` } });
    assert.equal((await otherProgress.json()).data.summary.attempts, 0);
    await page.goto(`${base}/`); await page.getByRole("heading", { name: "Conteúdo disponível para treinar" }).waitFor();
    assert.equal(await page.getByText(/ranking mock|set\/2026|1\.000 vagas/i).count(), 0);
    assert.ok(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth + 1), "mobile layout must not overflow horizontally");
    await context.close();
    console.log("browser launch E2E passed: mobile, legacy redirect, general bank without contest, server score, validated comments, persisted history, isolation and admin auth");
  } catch (error) { console.error(output.slice(-3000)); throw error; }
  finally { await browser.close(); if (child.pid) { if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGTERM"); } await new Promise<void>((resolve) => fixture.close(() => resolve())); await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
