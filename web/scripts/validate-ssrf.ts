import assert from "node:assert/strict";
import { isPrivateIP, validateUrlWithDns } from "../src/lib/collector/http";

for (const ip of ["127.0.0.2", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "100.64.0.1", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1", "::ffff:172.16.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1"]) assert.equal(isPrivateIP(ip), true, ip);
assert.equal(isPrivateIP("1.1.1.1"), false);

async function main() {
  const dnsFailure = await validateUrlWithDns("https://public.example", async () => { throw new Error("DNS failed"); });
  assert.deepEqual(dnsFailure, { safe: false, error: "SSRF_DNS_VALIDATION_FAILED" });
  const mixed = await validateUrlWithDns("https://public.example", async () => [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }]);
  assert.deepEqual(mixed, { safe: false, error: "SSRF_BLOCKED" });
  const redirectPrivate = await validateUrlWithDns("https://redirect.example", async () => [{ address: "192.168.1.2", family: 4 }]);
  assert.equal(redirectPrivate.safe, false);
  const localhost = await validateUrlWithDns("http://localhost", async () => [{ address: "127.0.0.1", family: 4 }]);
  assert.equal(localhost.safe, false);
  console.log("ssrf validation passed");
}
main();
