import type { StaffPushOperationalPolicyShape } from "./staff-push-operational-policy";
import type { StaffPushProviderResult } from "./staff-push-provider";

export type StaffPushRandom = () => number;

export function retryDelaySeconds(
  attemptCount: number,
  result: StaffPushProviderResult,
  policy: StaffPushOperationalPolicyShape,
  random: StaffPushRandom,
): number {
  if (result.resultClass === "RATE_LIMITED") {
    const basis = result.retryAfterSeconds ?? 60;
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
    throw new Error("Staff Push random source returned an invalid sample.");
  }
  return (
    policy.retryMinimumSeconds +
    Math.floor(sample * (window - policy.retryMinimumSeconds + 1))
  );
}
