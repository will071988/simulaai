import assert from "node:assert/strict";
import { createClient, type Session } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const productionUrl = process.env.PRODUCTION_URL || "https://simulaai-kappa.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminEmail = process.env.OPS_SMOKE_ADMIN_EMAIL || "";
const executablePath = process.env.BROWSER_EXECUTABLE_PATH || "";

async function sessionForAdmin(): Promise<Session> {
  assert.equal(new URL(supabaseUrl).hostname, "ukwulespvvthyjqgrjfo.supabase.co", "unexpected Supabase project");
  assert.ok(anonKey && serviceKey && adminEmail && executablePath, "required UI smoke configuration is absent");
  const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: adminEmail, options: { redirectTo: `${productionUrl}/admin/operacoes` } });
  assert.equal(linkError, null, linkError?.message);
  assert.ok(link.properties?.hashed_token, "magic-link token hash was not generated");
  const browserClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await browserClient.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  assert.equal(error, null, error?.message);
  assert.ok(data.session, "authenticated session was not created");
  return data.session;
}

async function main() {
  const session = await sessionForAdmin();
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(({ storageKey, activeSession }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(activeSession));
    }, { storageKey: `sb-${projectRef}-auth-token`, activeSession: session });
    const page = await context.newPage();
    const apiResponse = page.waitForResponse((response) => response.url() === `${productionUrl}/api/admin/operations` && response.request().method() === "GET");
    const navigation = await page.goto(`${productionUrl}/admin/operacoes`, { waitUntil: "domcontentloaded" });
    assert.equal(navigation?.status(), 200, "admin page did not load");
    assert.equal((await apiResponse).status(), 200, "authenticated browser API request failed");
    await page.getByRole("heading", { name: "Operações", exact: true }).waitFor();
    await page.getByText("Saúde do coletor", { exact: true }).waitFor();
    await page.getByText("Fila de IA", { exact: true }).waitFor();
    await page.getByText("Ações recentes", { exact: true }).waitFor();
    await page.getByText("API em 24h", { exact: true }).waitFor();
    await page.getByText("Backlog devido", { exact: true }).waitFor();
    await page.getByText("Jobs e crons", { exact: true }).waitFor();
    await page.getByText("Alertas operacionais", { exact: true }).waitFor();
    await page.getByText("Erros de runtime/banco", { exact: true }).waitFor();
    await page.getByText("Retry indisponível", { exact: true }).first().waitFor();
    const body = await page.locator("body").innerText();
    assert.doesNotMatch(body, /Entre com uma conta administradora|Acesso restrito a administradores/);
    console.log(JSON.stringify({ ok: true, pageStatus: 200, authenticatedApiStatus: 200, renderedSections: ["Saúde do coletor", "Fila de IA", "Ações recentes", "API em 24h", "Backlog devido", "Jobs e crons", "Alertas operacionais", "Erros de runtime/banco"], permanentRetryDisabled: true }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "admin UI smoke failed");
  process.exitCode = 1;
});
