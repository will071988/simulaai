import assert from "node:assert/strict";
import { chromium } from "playwright-core";

// Isolated build test: block external traffic and never create an Auth user.
const origin = process.env.ACCOUNT_UI_FIXTURE_URL || "http://127.0.0.1:3026";
const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
assert.equal(new URL(origin).hostname, "127.0.0.1");
assert.ok(executablePath, "BROWSER_EXECUTABLE_PATH is required");

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  const notices: string[] = [];
  try {
    for (const existing of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      try {
        let signupCalls = 0;
        const failures: string[] = [];
        await context.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin === origin) {
            if (url.pathname.startsWith("/api/")) await route.fulfill({ json: { ok: true, data: null } });
            else await route.continue();
          } else if (url.pathname === "/auth/v1/signup") {
            signupCalls++;
            assert.equal(request.method(), "POST");
            assert.equal(request.postDataJSON().email, "signup@fixture.invalid");
            await route.fulfill({ json: {
              id: "11111111-1111-4111-8111-111111111111", aud: "authenticated",
              email: "signup@fixture.invalid", created_at: "2026-10-05T12:00:00Z",
              app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
              identities: existing ? [] : [{ id: "fixture", provider: "email" }],
            } });
          } else await route.abort();
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => failures.push(error.message));
        await page.goto(`${origin}/conta`);
        await page.getByRole("button", { name: "Criar conta", exact: true }).click();
        await page.getByLabel("Nome", { exact: true }).fill("Signup Fixture");
        await page.getByLabel("E-mail", { exact: true }).fill("signup@fixture.invalid");
        await page.getByLabel("Senha", { exact: true }).fill("fixture-only-password");
        await page.getByRole("button", { name: "Criar conta", exact: true }).last().click();
        await page.getByRole("status").waitFor();
        const notice = await page.getByRole("status").innerText();
        notices.push(notice);
        assert.match(notice, /Solicitação de cadastro recebida/);
        assert.match(notice, /use Entrar com sua senha original/);
        assert.doesNotMatch(notice, /Conta criada|Enviamos um e-mail/);
        assert.equal(signupCalls, 1);
        assert.equal(await page.getByLabel("Senha", { exact: true }).inputValue(), "");
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await page.getByRole("button", { name: "Enviar link mágico", exact: true }).waitFor();
        assert.deepEqual(failures, []);
      } finally { await context.close(); }
    }
    assert.equal(notices[0], notices[1], "signup copy must not disclose whether the address exists");
    console.log("Signup UI fixture passed: neutral confirmation, existing-account guidance, identical privacy-preserving response; no external network used.");
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
