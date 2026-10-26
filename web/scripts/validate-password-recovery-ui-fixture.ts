import assert from "node:assert/strict";
import { chromium } from "playwright-core";

// Isolated Auth contract test: no real email, user or password is changed.
const origin = process.env.ACCOUNT_UI_FIXTURE_URL || "http://127.0.0.1:3026";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
assert.ok(executablePath, "BROWSER_EXECUTABLE_PATH is required");

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    for (const outcome of ["success", "rate-limit", "offline"] as const) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        let calls = 0;
        await context.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.origin === origin) return route.continue();
          if (url.pathname !== "/auth/v1/recover") return route.abort();
          calls++;
          assert.equal(route.request().method(), "POST");
          assert.equal(route.request().postDataJSON().email, "recovery@fixture.invalid");
          assert.equal(url.searchParams.get("redirect_to"), `${origin}/conta/redefinir-senha`);
          if (outcome === "offline") return route.abort();
          await route.fulfill(outcome === "success" ? { json: {} } : { status: 429, json: { code: "over_email_send_rate_limit", msg: "Fixture rate limit" } });
        });
        const page = await context.newPage();
        await page.goto(`${origin}/conta`);
        await page.getByRole("button", { name: "Esqueci minha senha", exact: true }).click();
        assert.equal(await page.getByLabel("Senha", { exact: true }).count(), 0, "recovery must not require the forgotten password");
        await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
        assert.equal(calls, 0, "empty email must not send a request");
        await page.getByLabel("E-mail", { exact: true }).fill("recovery@fixture.invalid");
        await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
        if (outcome === "success") {
          await page.getByRole("status").waitFor();
          assert.match(await page.getByRole("status").innerText(), /Se houver uma conta apta para recuperação/);
        } else {
          await page.locator('p[role="alert"]').waitFor();
          assert.match(await page.locator('p[role="alert"]').innerText(), /Não foi possível/);
        }
        assert.equal(calls, 1);
        assert.equal(await page.getByRole("button", { name: "Enviar link de recuperação" }).isEnabled(), true);
      } finally { await context.close(); }
    }

    for (const suffix of ["", "#error=access_denied&error_code=otp_expired", "#type=recovery"]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        let changes = 0;
        await context.route("**/*", async (route) => {
          if (new URL(route.request().url()).origin === origin) return route.continue();
          if (route.request().method() === "PUT") changes++;
          await route.abort();
        });
        const page = await context.newPage();
        await page.goto(`${origin}/conta/redefinir-senha${suffix}`);
        await page.locator('p[role="alert"]').waitFor();
        assert.match(await page.locator('p[role="alert"]').innerText(), /inválido ou expirou/);
        assert.equal(await page.getByLabel("Nova senha", { exact: true }).count(), 0);
        assert.equal(changes, 0, "URL flags cannot authorize a password change");
      } finally { await context.close(); }
    }

    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "recovery@fixture.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T12:00:00Z" };
      const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "fixture-signature"].join(".");
      let changes = 0;
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.pathname !== "/auth/v1/user") return route.abort();
        if (request.method() === "PUT") {
          changes++;
          assert.equal(request.postDataJSON().password, "new-fixture-password");
          // Verify error handling first, then a successful retry.
          if (changes === 1) return route.fulfill({ status: 422, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "X-Supabase-Api-Version" }, json: { code: "same_password", msg: "Fixture same password" } });
        }
        await route.fulfill({ json: user });
      });
      const page = await context.newPage();
      const hash = new URLSearchParams({ access_token: token, refresh_token: "fixture-refresh-token", expires_in: "3600", token_type: "bearer", type: "recovery" });
      await page.goto(`${origin}/conta/redefinir-senha#${hash}`);
      await page.getByLabel("Nova senha", { exact: true }).fill("new-fixture-password");
      await page.getByLabel("Confirmar nova senha", { exact: true }).fill("different-fixture-password");
      await page.getByRole("button", { name: "Salvar nova senha" }).click();
      assert.match(await page.locator('p[role="alert"]').innerText(), /não coincidem/);
      assert.equal(changes, 0);
      await page.getByLabel("Confirmar nova senha", { exact: true }).fill("new-fixture-password");
      await page.getByRole("button", { name: "Salvar nova senha" }).click();
      await page.locator('p[role="alert"]').filter({ hasText: /Escolha uma senha|Não foi possível/ }).waitFor();
      assert.equal(changes, 1, `expected a password update request; UI: ${await page.locator('p[role="alert"]').innerText()}`);
      assert.equal(await page.locator('p[role="alert"]').innerText(), "Escolha uma senha diferente da anterior.");
      await page.getByRole("button", { name: "Salvar nova senha" }).click();
      await page.getByText("Senha atualizada com sucesso. Use a nova senha no próximo acesso.", { exact: true }).waitFor();
      assert.equal(changes, 2);
      assert.equal(await page.getByLabel("Nova senha", { exact: true }).count(), 0);
    } finally { await context.close(); }
    console.log("Password recovery UI passed: email-only request, neutral notice, network/rate-limit errors, invalid/expired links, verified recovery callback, confirmation, retry and password update; no external network used.");
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
