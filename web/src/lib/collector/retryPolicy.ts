export type RetryDecision = { nextStatus: "AI_PENDING" | "FAILED"; incrementRetry: boolean; delaySeconds: number };

function retryAfterSeconds(value: string | undefined, now: Date) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(1, Math.ceil((timestamp - now.getTime()) / 1000));
}

export function getAIRetryDecision(errorCode: string, retryCount: number, now = new Date(), retryAfter?: string): RetryDecision {
  if (errorCode === "INSUFFICIENT_IDENTITY") return { nextStatus: "FAILED", incrementRetry: true, delaySeconds: 0 };
  if (errorCode === "INVALID_SCHEMA" || errorCode === "SCHEMA_SEMANTIC_ERROR") {
    return retryCount + 1 >= 3
      ? { nextStatus: "FAILED", incrementRetry: true, delaySeconds: 0 }
      : { nextStatus: "AI_PENDING", incrementRetry: true, delaySeconds: 60 * 60 };
  }
  if (["BUDGET_EXCEEDED", "BUDGET_EXHAUSTED", "PAID_MODEL_BLOCKED", "MODEL_NOT_FREE", "AUTH_CONFIGURATION_ERROR"].includes(errorCode)) {
    const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0);
    return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: Math.max(60, Math.ceil((nextUtcDay - now.getTime()) / 1000)) };
  }
  if (errorCode === "429" || errorCode === "RATE_LIMIT") return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: retryAfterSeconds(retryAfter, now) || 5 * 60 };
  if (["PROVIDER_DOWN", "PROVIDER_UNAVAILABLE", "MODEL_UNAVAILABLE", "SKIPPED_NOT_CONFIGURED", "HTTP_5XX", "AI_PENDING", "TIMEOUT"].includes(errorCode)) return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: 15 * 60 };
  if (errorCode === "CONCURRENCY_RETRY") return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: 60 };
  return retryCount + 1 >= 3
    ? { nextStatus: "FAILED", incrementRetry: true, delaySeconds: 0 }
    : { nextStatus: "AI_PENDING", incrementRetry: true, delaySeconds: 30 * 60 };
}
