import type { StaffPushOperationalPolicyShape } from "../src/modules/staff-push/staff-push-operational-policy";

export const syntheticStaffPushPolicy: StaffPushOperationalPolicyShape = {
  activeRegistrationStaleDays: 30,
  cleanupIntervalHours: 24,
  creationEnabled: true,
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
};

export function installSyntheticStaffPushPolicyEnvironment(): () => void {
  const prior = {
    ...Object.fromEntries(
      Object.keys(testEnvironment).map((name) => [name, process.env[name]]),
    ),
  };
  Object.assign(process.env, testEnvironment);
  return () => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    for (const name of Object.keys(testEnvironment)) restore(name, prior[name]);
  };
}

const testEnvironment = {
  STAFF_PUSH_ACTIVE_REGISTRATION_STALE_DAYS: "30",
  STAFF_PUSH_CLEANUP_INTERVAL_HOURS: "24",
  STAFF_PUSH_INTENT_DELIVERY_RETENTION_DAYS: "7",
  STAFF_PUSH_LEASE_DURATION_SECONDS: "30",
  STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS: "10",
  STAFF_PUSH_RETRIEVAL_CREATION_ENABLED: "true",
  STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS: "300",
  STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS: "4",
  STAFF_PUSH_RETRIEVAL_POLICY_VERSION: "1",
  STAFF_PUSH_RETRY_CAP_SECONDS: "60",
  STAFF_PUSH_RETRY_MINIMUM_SECONDS: "10",
  STAFF_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS: "30",
  STAFF_PUSH_WORKER_SENDING_ENABLED: "false",
};
