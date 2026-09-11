import type { PostgresPool } from "../../common/database/postgres";
import {
  claimStaffPushDelivery,
  terminalizeUnclaimableStaffPushDeliveries,
} from "./staff-push-claim-repository";
import {
  claimedDeliveryExpiry,
  resolveEligibleStaffPushDelivery,
} from "./staff-push-eligibility-repository";
import {
  finalizeInvalidEndpoint,
  finalizeStaffPushDelivery,
  retryOrTerminalizeStaffPushDelivery,
} from "./staff-push-finalization-repository";
import type { StaffPushOperationalPolicyShape } from "./staff-push-operational-policy";
import {
  retryDelayBucket,
  type StaffPushObserver,
} from "./staff-push-observability";
import { buildRetrievalAttentionMessage } from "./staff-push-payload";
import type { StaffPushProvider } from "./staff-push-provider";
import { retryDelaySeconds, type StaffPushRandom } from "./staff-push-retry";

const retryable = new Set([
  "TRANSIENT",
  "RATE_LIMITED",
  "CONFIGURATION",
  "UNKNOWN",
]);

export class StaffPushDeliveryWorker {
  constructor(
    private readonly pool: PostgresPool,
    private readonly policy: StaffPushOperationalPolicyShape,
    private readonly provider: StaffPushProvider,
    private readonly observer: StaffPushObserver,
    private readonly random: StaffPushRandom = Math.random,
    private readonly now: () => Date = () => new Date(),
    private readonly afterProviderResult: () => Promise<void> = async () =>
      undefined,
    private readonly beforeProviderCall: () => Promise<void> = async () =>
      undefined,
  ) {}

  async runOnce(): Promise<boolean> {
    if (!this.policy.sendingEnabled) return false;
    await terminalizeUnclaimableStaffPushDeliveries(this.pool);
    const claim = await claimStaffPushDelivery(
      this.pool,
      this.policy.leaseDurationSeconds,
    );
    if (claim === undefined) return false;
    await this.observer.observe({
      attempt: String(claim.attemptCount) as "1" | "2" | "3" | "4",
      event: "CLAIM",
      reclaimed: claim.reclaimed,
    });
    const eligible = await resolveEligibleStaffPushDelivery(this.pool, claim);
    if (eligible === undefined) {
      const expiry = await claimedDeliveryExpiry(this.pool, claim);
      if (expiry !== undefined && expiry.getTime() <= this.now().getTime()) {
        if (await finalizeStaffPushDelivery(this.pool, claim, "EXPIRED")) {
          await this.observer.observe({ event: "EXPIRED" });
        }
      } else if (
        await finalizeStaffPushDelivery(this.pool, claim, "SUPPRESSED")
      ) {
        await this.observer.observe({
          event: "SUPPRESSED",
          reason: "ELIGIBILITY_LOST",
        });
      }
      return true;
    }
    const message = buildRetrievalAttentionMessage({
      expiresAt: eligible.expiresAt,
      intentId: eligible.intentId,
      locale: eligible.locale,
      now: this.now(),
      providerToken: eligible.providerToken,
    });
    if (message === undefined) {
      if (await finalizeStaffPushDelivery(this.pool, claim, "EXPIRED")) {
        await this.observer.observe({ event: "EXPIRED" });
      }
      return true;
    }
    await this.beforeProviderCall();
    const result = await this.provider.send(message);
    await this.afterProviderResult();
    await this.observer.observe({
      event: "PROVIDER_RESULT",
      resultClass: result.resultClass,
    });
    if (result.resultClass === "ACCEPTED") {
      await finalizeStaffPushDelivery(
        this.pool,
        claim,
        "PROVIDER_ACCEPTED",
        "ACCEPTED",
      );
    } else if (result.resultClass === "INVALID_ENDPOINT") {
      await finalizeInvalidEndpoint(this.pool, eligible);
    } else if (result.resultClass === "PERMANENT") {
      if (
        await finalizeStaffPushDelivery(
          this.pool,
          claim,
          "PERMANENT_FAILURE",
          "PERMANENT",
        )
      ) {
        await this.observer.observe({ event: "TERMINAL_FAILURE" });
      }
    } else if (retryable.has(result.resultClass)) {
      const delay = retryDelaySeconds(
        claim.attemptCount,
        result,
        this.policy,
        this.random,
      );
      const state = await retryOrTerminalizeStaffPushDelivery(
        this.pool,
        claim,
        result.resultClass as
          "TRANSIENT" | "RATE_LIMITED" | "CONFIGURATION" | "UNKNOWN",
        delay,
      );
      if (state === "RETRY_WAIT") {
        await this.observer.observe({
          delayBucket: retryDelayBucket(delay),
          event: "RETRY_SCHEDULED",
        });
      } else if (state === "EXPIRED") {
        await this.observer.observe({ event: "EXPIRED" });
      } else if (state === "PERMANENT_FAILURE") {
        await this.observer.observe({ event: "TERMINAL_FAILURE" });
      }
    }
    return true;
  }
}
