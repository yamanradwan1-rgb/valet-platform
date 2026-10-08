import { performance } from "node:perf_hooks";

import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleDestroy,
} from "@nestjs/common";

import { ApplicationDrainState } from "./application-drain-state";

export const applicationDrainBudgetMs = 10_000;

@Injectable()
export class GracefulDrainLifecycle
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger("T4Drain");

  constructor(private readonly state: ApplicationDrainState) {}

  onModuleDestroy(): void {
    // Defense in depth for teardown paths other than public close/signals.
    this.state.beginDrain();
  }

  async beforeApplicationShutdown(): Promise<void> {
    const started = performance.now();
    this.state.beginDrain();
    this.logger.log(
      `T4_DRAIN state=withdrawn activeRequests=${this.state.activeRequests()}`,
    );
    const drained = await this.state.waitForIdle(applicationDrainBudgetMs);
    this.logger.log(
      `T4_DRAIN state=complete durationMs=${Math.round(performance.now() - started)} ` +
        `remainingRequests=${this.state.activeRequests()} result=${drained ? "drained" : "deadline"}`,
    );
  }
}
