import { createHash } from "node:crypto";

import { Logger } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import type { WebPushStorageKeyring } from "../../common/web-push/subscription-crypto";
import { prepareWebPushDelivery } from "./web-push-delivery-repository";
import {
  finalizeGoneWebPushDelivery,
  finalizeWebPushDelivery,
  retryWebPushDelivery,
} from "./web-push-delivery-state";
import {
  classifyWebPushOutcome,
  computeWebPushRetry,
  parseRetryAfter,
} from "./web-push-delivery-policy";
import { buildWebPushPayload } from "./web-push-payload";
import type { WebPushSender, WebPushSendResult } from "./web-push-sender";
import type {
  ClaimedWebPushDelivery,
  PreparedWebPushDelivery,
  WebPushFailureClass,
} from "./web-push-delivery-types";

function safeId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export class WebPushDeliveryProcessor {
  private readonly logger = new Logger(WebPushDeliveryProcessor.name);

  constructor(
    private readonly pool: PostgresPool,
    private readonly keyring: WebPushStorageKeyring,
    private readonly sender: WebPushSender,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  async process(claim: ClaimedWebPushDelivery): Promise<void> {
    const delivery = await prepareWebPushDelivery(
      this.pool,
      this.keyring,
      claim,
    );
    if (delivery === null) return;
    let payload: string;
    try {
      payload = JSON.stringify(this.payload(delivery));
    } catch {
      await finalizeWebPushDelivery(this.pool, {
        claim,
        failure: "PAYLOAD",
        status: "TERMINAL",
      });
      this.logOutcome(claim, delivery, "PAYLOAD", 0);
      return;
    }
    const now = this.now();
    const ttlSeconds = Math.max(
      1,
      Math.floor((delivery.expiresAt.getTime() - now.getTime()) / 1_000),
    );
    const started = Date.now();
    const result = await this.sender.send({
      auth: delivery.auth,
      endpoint: delivery.endpoint,
      p256dh: delivery.p256dh,
      payload,
      ttlSeconds,
    });
    await this.finalize(claim, delivery, result, now);
    this.logOutcome(
      claim,
      delivery,
      this.coarseOutcome(result),
      Date.now() - started,
    );
  }

  private logOutcome(
    claim: ClaimedWebPushDelivery,
    delivery: PreparedWebPushDelivery,
    outcome: string,
    latencyMs: number,
  ): void {
    this.logger.log({
      audience: delivery.audience,
      attempt: claim.attemptCount,
      delivery: safeId(claim.deliveryId),
      latencyMs,
      outcome,
      presentationType: delivery.presentationType,
    });
  }

  private payload(delivery: PreparedWebPushDelivery) {
    return delivery.presentationType === "EMPLOYEE_RETRIEVAL_REQUESTED"
      ? buildWebPushPayload({
          locale: delivery.locale,
          presentationType: delivery.presentationType,
          taskId: delivery.taskId!,
        })
      : buildWebPushPayload({
          locale: delivery.locale,
          presentationType: delivery.presentationType,
          readyAt: delivery.readyAt!.toISOString(),
          valetSessionId: delivery.valetSessionId!,
        });
  }

  private async finalize(
    claim: ClaimedWebPushDelivery,
    delivery: PreparedWebPushDelivery,
    result: WebPushSendResult,
    now: Date,
  ): Promise<void> {
    if (result.networkError === true || result.statusCode === undefined) {
      await this.retryOrTerminate(claim, delivery, "NETWORK", now);
      return;
    }
    const outcome = classifyWebPushOutcome(result.statusCode);
    if (outcome === "ACCEPTED") {
      await finalizeWebPushDelivery(this.pool, { claim, status: "ACCEPTED" });
    } else if (outcome === "ENDPOINT_GONE") {
      await finalizeGoneWebPushDelivery(
        this.pool,
        claim,
        delivery.subscriptionId,
        delivery.subscriptionSnapshot,
      );
    } else if (outcome === "RETRY") {
      const failure =
        result.statusCode === 429 ? "RATE_LIMITED" : "PUSH_SERVICE";
      await this.retryOrTerminate(
        claim,
        delivery,
        failure,
        now,
        parseRetryAfter(result.retryAfter, now),
      );
    } else {
      await finalizeWebPushDelivery(this.pool, {
        claim,
        failure: outcome === "CONFIGURATION" ? "CONFIGURATION" : "PAYLOAD",
        status: "TERMINAL",
      });
    }
  }

  private async retryOrTerminate(
    claim: ClaimedWebPushDelivery,
    delivery: PreparedWebPushDelivery,
    failure: WebPushFailureClass,
    now: Date,
    retryAfter?: Date,
  ): Promise<void> {
    const retry = computeWebPushRetry({
      attempt: claim.attemptCount,
      expiresAt: delivery.expiresAt,
      now,
      random: this.random,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    });
    if ("terminal" in retry) {
      await finalizeWebPushDelivery(this.pool, {
        claim,
        failure,
        status: "TERMINAL",
      });
    } else {
      await retryWebPushDelivery(
        this.pool,
        claim,
        failure,
        retry.nextAttemptAt,
      );
    }
  }

  private coarseOutcome(result: WebPushSendResult): string {
    if (result.networkError === true || result.statusCode === undefined)
      return "NETWORK";
    const outcome = classifyWebPushOutcome(result.statusCode);
    return outcome === "RETRY"
      ? `${Math.floor(result.statusCode / 100)}XX`
      : outcome;
  }
}
