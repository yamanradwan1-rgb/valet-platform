import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { WebPushServerConfig } from "@valet/config";

import type { PostgresPool } from "../../common/database/postgres";
import type { WebPushStorageKeyring } from "../../common/web-push/subscription-crypto";
import { WEB_PUSH_DELIVERY } from "./web-push-delivery-constants";
import { WebPushDeliveryProcessor } from "./web-push-delivery-processor";
import {
  disableStaleWebPushSubscriptions,
  expireWebPushDeliveries,
} from "./web-push-delivery-cleanup";
import { claimWebPushDeliveries } from "./web-push-delivery-state";
import {
  materializeWebPushDeliveries,
  reconcileWebPushIntents,
} from "./web-push-reconciler";
import type { WebPushSender } from "./web-push-sender";

export class WebPushDeliveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WebPushDeliveryWorker.name);
  private current: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly pool: PostgresPool,
    private readonly config: WebPushServerConfig,
    private readonly sender: WebPushSender,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(
      () => this.startCycle(),
      WEB_PUSH_DELIVERY.pollMilliseconds,
    );
    this.timer.unref();
    this.startCycle();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.current;
  }

  private startCycle(): void {
    if (this.current !== undefined) return;
    this.current = this.cycle()
      .catch(() => this.logger.error("WEB_PUSH_DELIVERY_CYCLE_FAILED"))
      .finally(() => {
        this.current = undefined;
      });
  }

  private async cycle(): Promise<void> {
    await this.safeStage("RECONCILE", () => reconcileWebPushIntents(this.pool));
    await this.safeStage("MATERIALIZE", () =>
      materializeWebPushDeliveries(this.pool),
    );
    await this.safeStage("CLEANUP", () =>
      disableStaleWebPushSubscriptions(this.pool),
    );
    await this.safeStage("EXPIRE", () => expireWebPushDeliveries(this.pool));
    const claims = await this.safeStage("CLAIM", () =>
      claimWebPushDeliveries(this.pool),
    );
    if (claims === undefined || claims.length === 0) return;
    const keyring = this.config.storageKeys as WebPushStorageKeyring;
    const processor = new WebPushDeliveryProcessor(
      this.pool,
      keyring,
      this.sender,
    );
    const outcomes = await Promise.allSettled(
      claims.map((claim) => processor.process(claim)),
    );
    const failed = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    ).length;
    if (failed > 0) {
      this.logger.error(`WEB_PUSH_DELIVERY_PROCESSING_FAILED count=${failed}`);
    }
  }

  private async safeStage<T>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch {
      this.logger.error(`WEB_PUSH_DELIVERY_${name}_FAILED`);
      return undefined;
    }
  }
}
