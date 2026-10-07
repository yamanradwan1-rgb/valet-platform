const retryBaseDelayMs = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

export class NativeTaskGpsRetryBudget {
  private delay: number | null = null;
  private retryCount = 0;

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.delay = null;
    this.retryCount = 0;
  }

  nextDelay(): number | null {
    const base = retryBaseDelayMs[this.retryCount];
    if (base === undefined) return null;
    this.retryCount += 1;
    const jitter = 0.9 + Math.min(1, Math.max(0, this.random())) * 0.2;
    this.delay = Math.round(base * jitter);
    return this.delay;
  }

  pendingDelay(): number | null {
    return this.delay;
  }
}
