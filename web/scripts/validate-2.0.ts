import assert from "node:assert/strict";
import { bearerToken } from "../src/lib/auth/server";
import { ProfileUpdateSchema, safeProfile } from "../src/lib/auth/profile";

assert.equal(bearerToken(new Request("https://example.test", { headers: { authorization: "Bearer valid.jwt.token" } })), "valid.jwt.token");
assert.equal(bearerToken(new Request("https://example.test", { headers: { authorization: "Basic nope" } })), null);
assert.equal(bearerToken(new Request("https://example.test", { headers: { authorization: "Bearer token with spaces" } })), null);
assert.equal(ProfileUpdateSchema.safeParse({ nome: "Ana Silva" }).success, true);
assert.equal(ProfileUpdateSchema.safeParse({ nome: "A" }).success, false);
assert.equal(ProfileUpdateSchema.safeParse({ nome: "Ana", email: "coleta@desnecessaria.test" }).success, false, "profile API must reject unnecessary data");
assert.deepEqual(safeProfile({ user_id: "u1", nome: "Ana", created_at: "c", updated_at: "u", email: "must-not-leak" }), { userId: "u1", nome: "Ana", createdAt: "c", updatedAt: "u" });
console.log("Sprint 2.0 bearer-token parsing, minimal profile schema and data-minimization tests passed");
