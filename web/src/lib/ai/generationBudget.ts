export type GenerationPermit = () => Promise<boolean>;

// One instance per collector execution, shared across documents, retries and fallback.
export class GenerationBudget {
  calls = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(readonly limit: number, readonly providerOrder?: readonly string[]) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error("INVALID_RUN_BUDGET");
  }

  async reserve(reserveDaily: GenerationPermit): Promise<boolean> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.calls >= this.limit || !(await reserveDaily())) return false;
      this.calls++;
      return true;
    } catch {
      return false;
    } finally {
      release();
    }
  }
}

export function generationTimeoutMs(): number {
  const configuredTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);
  return Number.isFinite(configuredTimeout) ? Math.max(5000, Math.min(55000, Math.trunc(configuredTimeout))) : 30000;
}

export async function generationFetch(url: string, options: RequestInit, permit?: GenerationPermit): Promise<Response> {
  // All local guards and serialization run before reserving; automatic redirects
  // are forbidden so one reservation cannot trigger multiple provider requests.
  if (!permit || !(await permit())) throw new Error("BUDGET_EXCEEDED");
  const timeoutMs = generationTimeoutMs();
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
}
