import { Injectable } from "@nestjs/common";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface StaffPushIntentCreationPolicy {
  readonly intentTtlSeconds: number;
  readonly maxAttempts: number;
  readonly policyVersion: number;
}

export interface StaffPushOperationalPolicyShape {
  readonly activeRegistrationStaleDays: number;
  readonly cleanupIntervalHours: number;
  readonly creationEnabled: boolean;
  readonly employeeRetrievalRequested: StaffPushIntentCreationPolicy;
  readonly intentDeliveryRetentionDays: number;
  readonly leaseDurationSeconds: number;
  readonly providerCallTimeoutSeconds: number;
  readonly retryCapSeconds: number;
  readonly retryMinimumSeconds: number;
  readonly sendingEnabled: boolean;
  readonly terminalRegistrationRetentionDays: number;
}

const acceptedV1 = {
  activeRegistrationStaleDays: 30,
  cleanupIntervalHours: 24,
  intentDeliveryRetentionDays: 7,
  intentTtlSeconds: 300,
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
    throw new Error(`Required Staff Push configuration is invalid: ${name}.`);
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
    throw new Error(
      `Required Staff Push policy configuration is invalid: ${name}.`,
    );
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value > POSTGRES_INTEGER_MAX ||
    value !== accepted
  ) {
    throw new Error(
      `Required Staff Push policy configuration is invalid: ${name}.`,
    );
  }
  return value;
}

export function readStaffPushOperationalPolicy(
  env: NodeJS.ProcessEnv,
): StaffPushOperationalPolicyShape {
  const policy: StaffPushOperationalPolicyShape = {
    activeRegistrationStaleDays: requiredInteger(
      env,
      "STAFF_PUSH_ACTIVE_REGISTRATION_STALE_DAYS",
      acceptedV1.activeRegistrationStaleDays,
    ),
    cleanupIntervalHours: requiredInteger(
      env,
      "STAFF_PUSH_CLEANUP_INTERVAL_HOURS",
      acceptedV1.cleanupIntervalHours,
    ),
    creationEnabled: requiredBoolean(
      env,
      "STAFF_PUSH_RETRIEVAL_CREATION_ENABLED",
    ),
    employeeRetrievalRequested: {
      intentTtlSeconds: requiredInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS",
        acceptedV1.intentTtlSeconds,
      ),
      maxAttempts: requiredInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS",
        acceptedV1.maxAttempts,
      ),
      policyVersion: requiredInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_POLICY_VERSION",
        acceptedV1.policyVersion,
      ),
    },
    intentDeliveryRetentionDays: requiredInteger(
      env,
      "STAFF_PUSH_INTENT_DELIVERY_RETENTION_DAYS",
      acceptedV1.intentDeliveryRetentionDays,
    ),
    leaseDurationSeconds: requiredInteger(
      env,
      "STAFF_PUSH_LEASE_DURATION_SECONDS",
      acceptedV1.leaseDurationSeconds,
    ),
    providerCallTimeoutSeconds: requiredInteger(
      env,
      "STAFF_PUSH_PROVIDER_CALL_TIMEOUT_SECONDS",
      acceptedV1.providerCallTimeoutSeconds,
    ),
    retryCapSeconds: requiredInteger(
      env,
      "STAFF_PUSH_RETRY_CAP_SECONDS",
      acceptedV1.retryCapSeconds,
    ),
    retryMinimumSeconds: requiredInteger(
      env,
      "STAFF_PUSH_RETRY_MINIMUM_SECONDS",
      acceptedV1.retryMinimumSeconds,
    ),
    sendingEnabled: requiredBoolean(env, "STAFF_PUSH_WORKER_SENDING_ENABLED"),
    terminalRegistrationRetentionDays: requiredInteger(
      env,
      "STAFF_PUSH_TERMINAL_REGISTRATION_RETENTION_DAYS",
      acceptedV1.terminalRegistrationRetentionDays,
    ),
  };
  if (policy.providerCallTimeoutSeconds >= policy.leaseDurationSeconds) {
    throw new Error(
      "Staff Push provider timeout must be shorter than its lease.",
    );
  }
  if (policy.retryMinimumSeconds < 10) {
    throw new Error("Staff Push retry minimum must be at least 10 seconds.");
  }
  if (policy.retryCapSeconds < policy.retryMinimumSeconds) {
    throw new Error("Staff Push retry cap must not be below its minimum.");
  }
  return policy;
}

@Injectable()
export class StaffPushOperationalPolicy implements StaffPushOperationalPolicyShape {
  private get current(): StaffPushOperationalPolicyShape {
    return readStaffPushOperationalPolicy(process.env);
  }

  get activeRegistrationStaleDays(): number {
    return this.current.activeRegistrationStaleDays;
  }
  get cleanupIntervalHours(): number {
    return this.current.cleanupIntervalHours;
  }
  get creationEnabled(): boolean {
    return this.current.creationEnabled;
  }
  get employeeRetrievalRequested(): StaffPushIntentCreationPolicy {
    return this.current.employeeRetrievalRequested;
  }
  get intentDeliveryRetentionDays(): number {
    return this.current.intentDeliveryRetentionDays;
  }
  get leaseDurationSeconds(): number {
    return this.current.leaseDurationSeconds;
  }
  get providerCallTimeoutSeconds(): number {
    return this.current.providerCallTimeoutSeconds;
  }
  get retryCapSeconds(): number {
    return this.current.retryCapSeconds;
  }
  get retryMinimumSeconds(): number {
    return this.current.retryMinimumSeconds;
  }
  get sendingEnabled(): boolean {
    return this.current.sendingEnabled;
  }
  get terminalRegistrationRetentionDays(): number {
    return this.current.terminalRegistrationRetentionDays;
  }
}
