import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3100;
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base + "/", { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("LOCAL_SERVER_NOT_READY");
}

async function expectStatus(path: string, status: number, init?: RequestInit) {
  const response = await fetch(base + path, { redirect: "manual", ...init });
  assert.equal(response.status, status, `${path} expected ${status}, got ${response.status}`);
  return response;
}

async function main() {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start", "--", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer();

    for (const path of ["/", "/concursos", "/simulados", "/quiz", "/conta", "/privacidade", "/termos", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]) {
      await expectStatus(path, 200);
    }

    const home = await (await expectStatus("/", 200)).text();
    assert.match(home, /29,90|29\.90/);
    assert.doesNotMatch(home, /Pagamento será disponibilizado em breve/);

    await expectStatus("/api/billing/entitlement", 401);
    await expectStatus("/api/admin/analytics?days=30", 401);
    await expectStatus("/api/billing/checkout", 401, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode: "premium_monthly" }),
    });
    await expectStatus("/api/billing/webhook", 400, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "invalid" },
      body: JSON.stringify({ id: "evt_invalid", type: "invalid" }),
    });

    const invalidWindow = await expectStatus("/api/admin/analytics?days=13", 401);
    assert.equal(invalidWindow.headers.get("cache-control")?.includes("no-store"), true);

    const security = await expectStatus("/", 200);
    assert.ok(security.headers.get("x-content-type-options") || security.headers.get("content-security-policy"));

    console.log("Sprint 3.6 local production-mode E2E smoke passed");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!child.killed) child.kill("SIGKILL");
    if (child.exitCode && child.exitCode !== 0) {
      console.error(output.slice(-4000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
