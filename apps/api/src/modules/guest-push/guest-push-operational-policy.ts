const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface GuestPushOperationalPolicyShape {
  readonly cleanupIntervalHours: number;
  readonly intentDeliveryRetentionDays: number;
  readonly intentTtlSeconds: number;
  readonly leaseDurationSeconds: number;
  readonly maxAttempts: number;
  readonly policyVersion: number;
  readonly providerCallTimeoutSeconds: number;
  readonly retryCapSeconds: number;
  readonly retryMinimumSeconds: number;
  readonly sendingEnabled: boolean;
  readonly terminalRegistrationRetentionDays: number;
}

export const guestPushPolicyV1 = {
  cleanupIntervalHours: 24,
  intentDeliveryRetentionDays: 7,
  intentTtlSeconds: 1_800,
  leaseDurationSeconds: 30,
  maxAttempts: 4,
  policyVersion: 1,
  providerCallTimeoutSeconds: 10,
  retryCapSeconds: 60,
  retryMinimumSeconds: 10,
  terminalRegistrationRetentionDays: 30,
} as const;

function requiredBoolean(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = env[name];
  if (raw !== "true" && raw !== "false") {
    throw new Error(`Required Guest Web Push configuration is invalid: ${name}.`);
  }
  return raw === "true";
}

function requiredInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  accepted: number,
): number {
  const raw = env[name];
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    throw new Error(`Required Guest Web Push policy is invalid: ${name}.`);
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value > POSTGRES_INTEGER_MAX ||
    value !== accepted
  ) {
    throw new Error(`Required Guest Web Push policy is invalid: ${name}.`);
  }
  return value;
}

export function readGuestPushOperationalPolicy(
  env: NodeJS.ProcessEnv,
): GuestPushOperationalPolicyShape {
  const configured = {
    cleanupIntervalHours: guestPushPolicyV1.cleanupIntervalHours,
    intentDeliveryRetentionDays: requiredInteger(
      env,
      "GUEST_PUSH_INTENT_DELIVERY_RETENTION_DAYS",
      guestPushPolicyV1.intentDeliveryRetentionDays,
    ),
    intentTtlSeconds: requiredInteger(
      env,
      "GUEST_PUSH_INTENT_TTL_SECONDS",
      guestPushPolicyV1.intentTtlSeconds,
    ),
    leaseDurationSeconds: requiredInteger(
      env,
      "GUEST_PUSH_LEASE_DURATION_SECONDS",
      guestPushPolicyV1.leaseDurationSeconds,
    ),
    maxAttempts: requiredInteger(
      env,
      "GUEST_PUSH_MAX_ATTEMPTS",
      guestPushPolicyV1.maxAttempts,
    ),
    policyVersion: requiredInteger(
      env,
      "GUEST_PUSH_POLICY_VERSION",
      guestPushPolicyV1.policyVersion,
    ),
    providerCallTimeoutSeconds: requiredInteger(
      env,
      "GUEST_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS",
      guestPushPolicyV1.providerCallTimeoutSeconds,
    ),
    retryCapSeconds: requiredInteger(
      env,
      "GUEST_PUSH_RETRY_CAP_SECONDS",
      guestPushPolicyV1.retryCapSeconds,
    ),
    retryMinimumSeconds: requiredInteger(
      env,
      "GUEST_PUSH_RETRY_MINIMUM_SECONDS",
      guestPushPolicyV1.retryMinimumSeconds,
    ),
    sendingEnabled: requiredBoolean(env, "GUEST_PUSH_WORKER_SENDING_ENABLED"),
    terminalRegistrationRetentionDays: requiredInteger(
      env,
      "GUEST_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS",
      guestPushPolicyV1.terminalRegistrationRetentionDays,
    ),
  };
  if (configured.providerCallTimeoutSeconds >= configured.leaseDurationSeconds) {
    throw new Error("Guest Web Push provider timeout must be shorter than its lease.");
  }
  return configured;
}
