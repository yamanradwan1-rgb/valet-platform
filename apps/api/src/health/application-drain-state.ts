import { Injectable } from "@nestjs/common";

type IdleWaiter = () => void;

@Injectable()
export class ApplicationDrainState {
  private draining = false;
  private inFlight = 0;
  private readonly idleWaiters = new Set<IdleWaiter>();

  beginDrain(): void {
    this.draining = true;
    this.resolveIdleWaiters();
  }

  isDraining(): boolean {
    return this.draining;
  }

  activeRequests(): number {
    return this.inFlight;
  }

  tryBeginRequest(): (() => void) | undefined {
    if (this.draining) return undefined;
    this.inFlight += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.resolveIdleWaiters();
    };
  }

  waitForIdle(maximumMs: number): Promise<boolean> {
    if (this.inFlight === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (drained: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.idleWaiters.delete(onIdle);
        resolve(drained);
      };
      const onIdle = () => finish(true);
      const timer = setTimeout(() => finish(false), maximumMs);
      timer.unref();
      this.idleWaiters.add(onIdle);
      this.resolveIdleWaiters();
    });
  }

  private resolveIdleWaiters(): void {
    if (this.inFlight !== 0) return;
    for (const waiter of [...this.idleWaiters]) waiter();
  }
}
