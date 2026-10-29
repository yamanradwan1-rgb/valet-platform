import type { PostgresPool } from "../../common/database/postgres";
import { claimStaffPushDelivery } from "./staff-push-claim-repository";
import {
  claimedDeliveryIsExpired,
  currentStaffPushLeaseBudgetMilliseconds,
  resolveEligibleStaffPushDelivery,
} from "./staff-push-eligibility-repository";
import {
  finalizeInvalidEndpoint,
  finalizeStaffPushDelivery,
  retryOrTerminalizeStaffPushDelivery,
} from "./staff-push-finalization-repository";
import type { StaffPushOperationalPolicyShape } from "./staff-push-operational-policy";
import {
  observeStaffPushSafely,
  retryDelayBucket,
  type StaffPushObserver,
} from "./staff-push-observability";
import { remainingStaffPushLifetime } from "./staff-push-lifetime";
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
    private readonly monotonicNow: () => number = () => performance.now(),
    private readonly afterProviderResult: () => Promise<void> = async () =>
      undefined,
    private readonly beforeProviderCall: () => Promise<void> = async () =>
      undefined,
  ) {}

  async runOnce(): Promise<boolean> {
    if (!this.policy.sendingEnabled) return false;
    const claim = await claimStaffPushDelivery(
      this.pool,
      this.policy.leaseDurationSeconds,
    );
    if (claim === undefined) return false;
    await observeStaffPushSafely(this.observer, {
      attempt: String(claim.attemptCount) as "1" | "2" | "3" | "4",
      event: "CLAIM",
      reclaimed: claim.reclaimed,
    });
    const eligibilityStartedAt = this.monotonicNow();
    const eligible = await resolveEligibleStaffPushDelivery(
      this.pool,
      claim,
      this.policy.activeRegistrationStaleDays,
    );
    if (eligible === undefined) {
      const expired = await claimedDeliveryIsExpired(this.pool, claim);
      if (expired === true) {
        if (await finalizeStaffPushDelivery(this.pool, claim, "EXPIRED")) {
          await observeStaffPushSafely(this.observer, { event: "EXPIRED" });
        }
      } else if (
        await finalizeStaffPushDelivery(this.pool, claim, "SUPPRESSED")
      ) {
        await observeStaffPushSafely(this.observer, {
          event: "SUPPRESSED",
          reason: "ELIGIBILITY_LOST",
        });
      }
      return true;
    }
    await this.beforeProviderCall();
    // The eligibility snapshot predates the hook: a replacement worker may
    // already own this row. Recheck the exact fence against the DB clock.
    let leaseCheckedAt = 0;
    let leaseBudget: number | undefined;
    let leaseBudgetLost = false;
    const leasePermitsTransport = (): boolean => {
      const remainingLease =
        leaseBudget === undefined
          ? undefined
          : remainingStaffPushLifetime(
              leaseBudget,
              leaseCheckedAt,
              this.monotonicNow(),
            );
      const permits =
        remainingLease !== undefined &&
        remainingLease > this.policy.providerCallTimeoutSeconds * 1_000;
      if (!permits) leaseBudgetLost = true;
      return permits;
    };
    const refreshLeaseBudget = async (): Promise<boolean> => {
      leaseCheckedAt = this.monotonicNow();
      leaseBudget = await currentStaffPushLeaseBudgetMilliseconds(
        this.pool,
        claim,
      );
      return leasePermitsTransport();
    };
    // Leave an insufficient/expired lease for bounded reclaim, without
    // falsely terminalizing an otherwise-live retrieval intent.
    if (!(await refreshLeaseBudget())) return true;
    const send = await this.provider.send({
      // The real FCM adapter awaits OAuth. Validate DB ownership again right
      // before HTTP POST; the local check below covers elapsed time afterward.
      mayStartTransport: refreshLeaseBudget,
      messageForTransport: () => {
        // FCM obtains OAuth credentials asynchronously before its actual POST.
        // Guard that second boundary against elapsed lease time as well.
        if (!leasePermitsTransport()) return undefined;
        const remainingLifetimeMilliseconds = remainingStaffPushLifetime(
          eligible.remainingLifetimeMilliseconds,
          eligibilityStartedAt,
          this.monotonicNow(),
        );
        if (remainingLifetimeMilliseconds === undefined) return undefined;
        return buildRetrievalAttentionMessage({
          intentId: eligible.intentId,
          locale: eligible.locale,
          providerToken: eligible.providerToken,
          remainingLifetimeMilliseconds,
        });
      },
    });
    if (send.kind === "EXPIRED_BEFORE_TRANSPORT") {
      if (leaseBudgetLost) return true;
      if (await finalizeStaffPushDelivery(this.pool, claim, "EXPIRED")) {
        await observeStaffPushSafely(this.observer, { event: "EXPIRED" });
      }
      return true;
    }
    const result = send.result;
    await this.afterProviderResult();
    await observeStaffPushSafely(this.observer, {
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
        await observeStaffPushSafely(this.observer, {
          event: "TERMINAL_FAILURE",
        });
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
        await observeStaffPushSafely(this.observer, {
          delayBucket: retryDelayBucket(delay),
          event: "RETRY_SCHEDULED",
        });
      } else if (state === "EXPIRED") {
        await observeStaffPushSafely(this.observer, { event: "EXPIRED" });
      } else if (state === "PERMANENT_FAILURE") {
        await observeStaffPushSafely(this.observer, {
          event: "TERMINAL_FAILURE",
        });
      }
    }
    return true;
  }
}
