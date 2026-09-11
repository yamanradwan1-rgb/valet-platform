import { describe, expect, it } from "vitest";

import { readFcmHttpV1Config } from "../src/modules/staff-push/fcm-http-v1-config";
import { readStaffPushOperationalPolicy } from "../src/modules/staff-push/staff-push-operational-policy";

const validEnvironment = {
  STAFF_PUSH_ACTIVE_REGISTRATION_STALE_DAYS: "30",
  STAFF_PUSH_CLEANUP_INTERVAL_HOURS: "24",
  STAFF_PUSH_INTENT_DELIVERY_RETENTION_DAYS: "7",
  STAFF_PUSH_LEASE_DURATION_SECONDS: "30",
  STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS: "10",
  STAFF_PUSH_RETRIEVAL_CREATION_ENABLED: "false",
  STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS: "300",
  STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: "4",
  STAFF_PUSH_RETRIEVAL_POLICY_VERSION: "1",
  STAFF_PUSH_RETRY_CAP_SECONDS: "60",
  STAFF_PUSH_RETRY_MINIMUM_SECONDS: "10",
  STAFF_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS: "30",
  STAFF_PUSH_WORKER_SENDING_ENABLED: "false",
};

describe("Staff Push operational policy", () => {
  it("accepts exactly the explicit DEC-075 v1 policy", () => {
    expect(readStaffPushOperationalPolicy(validEnvironment)).toEqual({
      activeRegistrationStaleDays: 30,
      cleanupIntervalHours: 24,
      creationEnabled: false,
      employeeRetrievalRequested: {
        intentTtlSeconds: 300,
        maxAttempts: 4,
        policyVersion: 1,
      },
      intentDeliveryRetentionDays: 7,
      leaseDurationSeconds: 30,
      providerCallTimeoutSeconds: 10,
      retryCapSeconds: 60,
      retryMinimumSeconds: 10,
      sendingEnabled: false,
      terminalRegistrationRetentionDays: 30,
    });
  });

  it.each(Object.keys(validEnvironment))(
    "fails closed when %s is missing",
    (name) => {
      const environment = { ...validEnvironment } as NodeJS.ProcessEnv;
      delete environment[name];
      expect(() => readStaffPushOperationalPolicy(environment)).toThrow(name);
    },
  );

  it.each(["", "0", "-1", "1.5", " 4", "2147483648", "5"])(
    "rejects malformed, nonpositive, unsafe, or unsupported attempt value %j",
    (value) => {
      expect(() =>
        readStaffPushOperationalPolicy({
          ...validEnvironment,
          STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: value,
        }),
      ).toThrow("STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS");
    },
  );

  it.each([
    ["STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS", "30"],
    ["STAFF_PUSH_RETRY_MINIMUM_SECONDS", "9"],
    ["STAFF_PUSH_RETRY_CAP_SECONDS", "9"],
    ["STAFF_PUSH_RETRIEVAL_POLICY_VERSION", "2"],
  ])("rejects unsupported invariant input %s=%s", (name, value) => {
    expect(() =>
      readStaffPushOperationalPolicy({
        ...validEnvironment,
        [name]: value,
      }),
    ).toThrow();
  });

  it("requires explicit boolean switches", () => {
    expect(() =>
      readStaffPushOperationalPolicy({
        ...validEnvironment,
        STAFF_PUSH_WORKER_SENDING_ENABLED: "yes",
      }),
    ).toThrow("STAFF_PUSH_WORKER_SENDING_ENABLED");
  });

  it("requires a valid explicit project only when sending is enabled", () => {
    expect(readFcmHttpV1Config({}, false, 10)).toBeUndefined();
    expect(() => readFcmHttpV1Config({}, true, 10)).toThrow();
    expect(
      readFcmHttpV1Config(
        { STAFF_PUSH_FCM_PROJECT_ID: "vaylet-staging-123" },
        true,
        10,
      ),
    ).toEqual({ projectId: "vaylet-staging-123", timeoutMilliseconds: 10_000 });
  });
});
