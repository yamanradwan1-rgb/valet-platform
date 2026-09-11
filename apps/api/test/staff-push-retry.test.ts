import { describe, expect, it } from "vitest";

import type { StaffPushOperationalPolicyShape } from "../src/modules/staff-push/staff-push-operational-policy";
import { retryDelaySeconds } from "../src/modules/staff-push/staff-push-retry";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";

const policy: StaffPushOperationalPolicyShape = {
  ...syntheticStaffPushPolicy,
  sendingEnabled: true,
};

describe("Staff Push retry policy", () => {
  it.each([
    [1, 0, 10],
    [1, 0.999, 20],
    [2, 0, 10],
    [2, 0.999, 40],
    [3, 0, 10],
    [3, 0.999, 60],
  ])(
    "keeps attempt %i sample %f in its bounded window",
    (attempt, sample, expected) => {
      expect(
        retryDelaySeconds(
          attempt,
          { resultClass: "UNKNOWN" },
          policy,
          () => sample,
        ),
      ).toBe(expected);
    },
  );

  it("clamps Retry-After and uses the 60-second missing basis", () => {
    expect(
      retryDelaySeconds(
        1,
        { resultClass: "RATE_LIMITED", retryAfterSeconds: 3 },
        policy,
        () => 0,
      ),
    ).toBe(10);
    expect(
      retryDelaySeconds(
        1,
        { resultClass: "RATE_LIMITED", retryAfterSeconds: 600 },
        policy,
        () => 0,
      ),
    ).toBe(60);
    expect(
      retryDelaySeconds(1, { resultClass: "RATE_LIMITED" }, policy, () => 0),
    ).toBe(60);
  });

  it("rejects invalid injected randomness", () => {
    expect(() =>
      retryDelaySeconds(1, { resultClass: "TRANSIENT" }, policy, () => 1),
    ).toThrow();
  });
});
