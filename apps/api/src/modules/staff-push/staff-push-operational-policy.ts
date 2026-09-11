import { Injectable } from "@nestjs/common";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface StaffPushIntentCreationPolicy {
  readonly intentTtlSeconds: number;
  readonly maxAttempts: number;
  readonly policyVersion: number;
}

export interface StaffPushOperationalPolicyShape {
  readonly employeeRetrievalRequested: StaffPushIntentCreationPolicy;
}

function requiredPositiveInteger(env: NodeJS.ProcessEnv, name: string): number {
  const raw = env[name];
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `Required Staff Push policy configuration is invalid: ${name}.`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > POSTGRES_INTEGER_MAX) {
    throw new Error(
      `Required Staff Push policy configuration is invalid: ${name}.`,
    );
  }
  return value;
}

export function readStaffPushOperationalPolicy(
  env: NodeJS.ProcessEnv,
): StaffPushOperationalPolicyShape {
  return {
    employeeRetrievalRequested: {
      intentTtlSeconds: requiredPositiveInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS",
      ),
      maxAttempts: requiredPositiveInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS",
      ),
      policyVersion: requiredPositiveInteger(
        env,
        "STAFF_PUSH_RETRIEVAL_POLICY_VERSION",
      ),
    },
  };
}

@Injectable()
export class StaffPushOperationalPolicy implements StaffPushOperationalPolicyShape {
  get employeeRetrievalRequested(): StaffPushIntentCreationPolicy {
    return readStaffPushOperationalPolicy(process.env)
      .employeeRetrievalRequested;
  }
}
