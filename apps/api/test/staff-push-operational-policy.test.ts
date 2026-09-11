import { describe, expect, it } from "vitest";

import { readStaffPushOperationalPolicy } from "../src/modules/staff-push/staff-push-operational-policy";

const validEnvironment = {
  STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS: "613",
  STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: "17",
  STAFF_PUSH_RETRIEVAL_POLICY_VERSION: "91020",
};

describe("Staff Push operational policy", () => {
  it("accepts explicit positive integer creation policy values", () => {
    expect(readStaffPushOperationalPolicy(validEnvironment)).toEqual({
      employeeRetrievalRequested: {
        intentTtlSeconds: 613,
        maxAttempts: 17,
        policyVersion: 91_020,
      },
    });
  });

  it.each([
    "STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS",
    "STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS",
    "STAFF_PUSH_RETRIEVAL_POLICY_VERSION",
  ])("fails closed when %s is missing", (name) => {
    const environment = { ...validEnvironment } as NodeJS.ProcessEnv;
    delete environment[name];
    expect(() => readStaffPushOperationalPolicy(environment)).toThrow(name);
  });

  it.each(["", "0", "-1", "1.5", " 1", "2147483648"])(
    "rejects an invalid numeric policy value %j",
    (value) => {
      expect(() =>
        readStaffPushOperationalPolicy({
          ...validEnvironment,
          STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: value,
        }),
      ).toThrow("STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS");
    },
  );
});
