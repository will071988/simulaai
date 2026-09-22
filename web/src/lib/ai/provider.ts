import type { AIRequest, AIResult, AIProviderHealth } from "./types";

export interface AIProvider {
  name: string;
  model: string;
  generate<T>(req: AIRequest): Promise<AIResult<T>>;
  healthCheck(): Promise<AIProviderHealth>;
}

// circuit breaker helper
export class CircuitBreaker {
  failures = 0;
  nextAllowed = 0;
  constructor(private threshold = 5, private cooldownMs = 15 * 60 * 1000) {}
  recordSuccess() { this.failures = 0; this.nextAllowed = 0; }
  recordFailure() {
    this.failures++;
    if (this.failures >= this.threshold) this.nextAllowed = Date.now() + this.cooldownMs;
  }
  isOpen() { return Date.now() < this.nextAllowed; }
}
