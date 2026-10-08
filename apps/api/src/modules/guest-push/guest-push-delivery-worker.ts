import type { PostgresPool } from "../../common/database/postgres";
import {
  claimedGuestPushDeliveryExpiry,
  claimGuestPushDelivery,
} from "./guest-push-claim-repository";
import { resolveEligibleGuestPushDelivery } from "./guest-push-eligibility-repository";
import {
  finalizeGuestPushDelivery,
  finalizeGuestPushInvalidEndpoint,
  retryOrTerminalizeGuestPushDelivery,
} from "./guest-push-finalization-repository";
import { remainingGuestPushLifetime } from "./guest-push-lifetime";
import {
  guestPushLatencyBucket,
  guestPushRetryDelayBucket,
  observeGuestPushSafely,
  type GuestPushObserver,
} from "./guest-push-observability";
import type { GuestPushOperationalPolicyShape } from "./guest-push-operational-policy";
import type { GuestPushProvider } from "./guest-push-provider";
import {
  guestPushRetryDelaySeconds,
  type GuestPushRandom,
} from "./guest-push-retry";

const retryable = new Set([
  "TRANSIENT",
  "RATE_LIMITED",
  "CONFIGURATION",
  "UNKNOWN",
]);

export class GuestPushDeliveryWorker {
  constructor(
    private readonly pool: PostgresPool,
    private readonly policy: GuestPushOperationalPolicyShape,
    private readonly provider: GuestPushProvider,
    private readonly observer: GuestPushObserver,
    private readonly random: GuestPushRandom = Math.random,
    private readonly monotonicNow: () => number = () => performance.now(),
    private readonly afterProviderResult: () => Promise<void> = async () =>
      undefined,
    private readonly beforeProviderCall: () => Promise<void> = async () =>
      undefined,
  ) {}

  async runOnce(): Promise<boolean> {
    if (!this.policy.sendingEnabled) return false;
    const claim = await claimGuestPushDelivery(
      this.pool,
      this.policy.leaseDurationSeconds,
    );
    if (claim === undefined) return false;
    await observeGuestPushSafely(this.observer, {
      attempt: String(claim.attemptCount) as "1" | "2" | "3" | "4",
      event: "CLAIM",
      reclaimed: claim.reclaimed,
    });
    const eligibilityStartedAt = this.monotonicNow();
    const eligible = await resolveEligibleGuestPushDelivery(
      this.pool,
      claim,
      this.policy.policyVersion,
    );
    if (eligible === undefined) {
      const expiry = await claimedGuestPushDeliveryExpiry(this.pool, claim);
      // Another worker owns a reclaimed claim, or our lease timed out before
      // the resolver ran. Do not suppress still-eligible durable work: leave
      // this lease for the next replica's safe reclaim.
      if (expiry === undefined || expiry.leaseExpired) return true;
      const state = expiry.intentExpired ? "EXPIRED" : "SUPPRESSED";
      if (await finalizeGuestPushDelivery(this.pool, claim, state)) {
        await observeGuestPushSafely(
          this.observer,
          state === "EXPIRED"
            ? { event: "EXPIRED" }
            : { event: "SUPPRESSED", reason: "ELIGIBILITY_LOST" },
        );
      }
      return true;
    }
    await this.beforeProviderCall();
    // Do not start transport on a lease that could expire before the provider's
    // bounded timeout. Leave the lease for safe expiration/reclaim, not a
    // misleading terminal EXPIRED transition for an otherwise-live READY intent.
    const remainingLease = remainingGuestPushLifetime(
      eligible.remainingLeaseMilliseconds,
      eligibilityStartedAt,
      this.monotonicNow(),
    );
    if (
      remainingLease === undefined ||
      remainingLease <= this.policy.providerCallTimeoutSeconds * 1_000
    ) {
      return true;
    }
    const providerStartedAt = this.monotonicNow();
    const send = await this.provider.send({
      messageForTransport: () => {
        const remaining = remainingGuestPushLifetime(
          eligible.remainingLifetimeMilliseconds,
          eligibilityStartedAt,
          this.monotonicNow(),
        );
        if (remaining === undefined) return undefined;
        return {
          auth: eligible.auth,
          endpoint: eligible.endpoint,
          intentId: eligible.intentId,
          locale: eligible.locale,
          p256dh: eligible.p256dh,
          ttlSeconds: Math.max(1, Math.ceil(remaining / 1_000)),
        };
      },
    });
    if (send.kind === "EXPIRED_BEFORE_TRANSPORT") {
      if (await finalizeGuestPushDelivery(this.pool, claim, "EXPIRED")) {
        await observeGuestPushSafely(this.observer, { event: "EXPIRED" });
      }
      return true;
    }
    const result = send.result;
    await this.afterProviderResult();
    await observeGuestPushSafely(this.observer, {
      event: "PROVIDER_RESULT",
      latencyBucket: guestPushLatencyBucket(
        Math.max(0, this.monotonicNow() - providerStartedAt),
      ),
      resultClass: result.resultClass,
    });
    if (result.resultClass === "ACCEPTED") {
      await finalizeGuestPushDelivery(
        this.pool,
        claim,
        "PROVIDER_ACCEPTED",
        "ACCEPTED",
      );
    } else if (result.resultClass === "INVALID_ENDPOINT") {
      if (await finalizeGuestPushInvalidEndpoint(this.pool, eligible)) {
        await observeGuestPushSafely(this.observer, { event: "INVALID_ENDPOINT" });
      }
    } else if (result.resultClass === "PERMANENT") {
      if (
        await finalizeGuestPushDelivery(
          this.pool,
          claim,
          "PERMANENT_FAILURE",
          "PERMANENT",
        )
      ) {
        await observeGuestPushSafely(this.observer, {
          event: "TERMINAL_FAILURE",
        });
      }
    } else if (retryable.has(result.resultClass)) {
      const delay = guestPushRetryDelaySeconds(
        claim.attemptCount,
        result,
        this.policy,
        this.random,
      );
      const state = await retryOrTerminalizeGuestPushDelivery(
        this.pool,
        claim,
        result.resultClass as
          | "TRANSIENT"
          | "RATE_LIMITED"
          | "CONFIGURATION"
          | "UNKNOWN",
        delay,
      );
      if (state === "RETRY_WAIT") {
        await observeGuestPushSafely(this.observer, {
          delayBucket: guestPushRetryDelayBucket(delay),
          event: "RETRY_SCHEDULED",
        });
      } else if (state === "EXPIRED") {
        await observeGuestPushSafely(this.observer, { event: "EXPIRED" });
      } else if (state === "PERMANENT_FAILURE") {
        await observeGuestPushSafely(this.observer, {
          event: "TERMINAL_FAILURE",
        });
      }
    }
    return true;
  }
}
