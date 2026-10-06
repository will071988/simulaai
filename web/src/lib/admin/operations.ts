import { z } from "zod";
import { isSafeUrl } from "@/lib/collector/security";

export const OperationActionSchema = z.object({
  action: z.enum(["RETRY_DOCUMENT", "APPROVE_SOURCE", "REJECT_SOURCE_CANDIDATE", "REVIEW_CONFLICT"]),
  targetId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
  officialUrl: z.url().max(2048).optional(),
  activateKnownAdapter: z.boolean().optional(),
}).strict();

export type OperationAction = z.infer<typeof OperationActionSchema>;

const RETRYABLE_DOCUMENT_ERRORS = new Set([
  "429", "AI_PENDING", "BUDGET_EXCEEDED", "CONCURRENCY_RETRY", "INVALID_JSON",
  "INVALID_SCHEMA", "MAX_RETRIES", "PAID_MODEL_BLOCKED", "PROVIDER_DOWN", "RATE_LIMIT", "TIMEOUT",
]);

export function canRetryFailedDocument(document: { status: string; ai_last_error_code: string | null; metadata?: unknown }) {
  const metadata = document.metadata && typeof document.metadata === "object" ? document.metadata as Record<string, unknown> : {};
  return document.status === "FAILED"
    && RETRYABLE_DOCUMENT_ERRORS.has(document.ai_last_error_code || "")
    && metadata.sync_error !== "INSUFFICIENT_IDENTITY";
}

export function validateOperationAction(input: unknown): OperationAction | null {
  const parsed = OperationActionSchema.safeParse(input);
  if (!parsed.success) return null;
  const action = parsed.data;
  if (["APPROVE_SOURCE", "REJECT_SOURCE_CANDIDATE", "REVIEW_CONFLICT"].includes(action.action) && (!action.note || action.note.length < 5)) return null;
  if (action.action === "APPROVE_SOURCE") {
    if (!action.officialUrl || !isSafeUrl(action.officialUrl)) return null;
    const url = new URL(action.officialUrl);
    if (url.protocol !== "https:" || url.port || url.hash || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.endsWith(".localhost")) return null;
    action.officialUrl = url.href;
  } else if (action.officialUrl || action.activateKnownAdapter !== undefined) return null;
  return action;
}
