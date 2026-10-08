import type { GuestPushOperationalPolicyShape } from "./guest-push-operational-policy";
import type { GuestPushProviderResult } from "./guest-push-provider";

export type GuestPushRandom = () => number;

export function guestPushRetryDelaySeconds(
  attemptCount: number,
  result: GuestPushProviderResult,
  policy: GuestPushOperationalPolicyShape,
  random: GuestPushRandom,
): number {
  if (result.resultClass === "RATE_LIMITED") {
    const basis = result.retryAfterSeconds ?? policy.retryCapSeconds;
    return Math.max(
      policy.retryMinimumSeconds,
      Math.min(policy.retryCapSeconds, Math.floor(basis)),
    );
  }
  const window = Math.min(
    policy.retryCapSeconds,
    policy.retryMinimumSeconds * 2 ** attemptCount,
  );
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("Guest Web Push random source returned an invalid sample.");
  }
  return (
    policy.retryMinimumSeconds +
    Math.floor(sample * (window - policy.retryMinimumSeconds + 1))
  );
}
