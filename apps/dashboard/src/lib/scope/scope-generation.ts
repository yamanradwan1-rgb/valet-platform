export interface ScopeRequestTicket {
  readonly generation: number;
  readonly signal: AbortSignal;
}

/**
 * Abort is best-effort transport cancellation; generation is the correctness
 * boundary. A late response is stale even when the underlying fetch ignored
 * AbortSignal.
 */
export class ScopeGenerationGuard {
  private generation = 0;
  private activeController: AbortController | null = null;

  begin(): ScopeRequestTicket {
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    this.generation += 1;
    return { generation: this.generation, signal: controller.signal };
  }

  invalidate(): void {
    this.activeController?.abort();
    this.activeController = null;
    this.generation += 1;
  }

  currentGeneration(): number {
    return this.generation;
  }

  isCurrent(ticket: ScopeRequestTicket): boolean {
    return ticket.generation === this.generation && !ticket.signal.aborted;
  }

  accept<T>(ticket: ScopeRequestTicket, value: T): T | undefined {
    return this.isCurrent(ticket) ? value : undefined;
  }
}
