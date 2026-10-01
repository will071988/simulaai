import { createHash, randomBytes } from "node:crypto";

export function createAttemptToken() {
  return randomBytes(32).toString("hex");
}

export function hashAttemptToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isAttemptToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
