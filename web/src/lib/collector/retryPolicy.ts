export type RetryDecision = { nextStatus: "AI_PENDING" | "FAILED"; incrementRetry: boolean; delaySeconds: number };

export function getAIRetryDecision(errorCode: string, retryCount: number, now = new Date()): RetryDecision {
  if (errorCode === "INVALID_SCHEMA") {
    return retryCount + 1 >= 3
      ? { nextStatus: "FAILED", incrementRetry: true, delaySeconds: 0 }
      : { nextStatus: "AI_PENDING", incrementRetry: true, delaySeconds: 60 * 60 };
  }
  if (errorCode === "BUDGET_EXCEEDED" || errorCode === "PAID_MODEL_BLOCKED") {
    const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0);
    return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: Math.max(60, Math.ceil((nextUtcDay - now.getTime()) / 1000)) };
  }
  if (errorCode === "429" || errorCode === "RATE_LIMIT") return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: 5 * 60 };
  if (errorCode === "PROVIDER_DOWN" || errorCode === "AI_PENDING" || errorCode === "TIMEOUT") return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: 15 * 60 };
  if (errorCode === "CONCURRENCY_RETRY") return { nextStatus: "AI_PENDING", incrementRetry: false, delaySeconds: 60 };
  return retryCount + 1 >= 3
    ? { nextStatus: "FAILED", incrementRetry: true, delaySeconds: 0 }
    : { nextStatus: "AI_PENDING", incrementRetry: true, delaySeconds: 30 * 60 };
}
