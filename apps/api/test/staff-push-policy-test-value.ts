import type { StaffPushOperationalPolicyShape } from "../src/modules/staff-push/staff-push-operational-policy";

export const syntheticStaffPushPolicy: StaffPushOperationalPolicyShape = {
  employeeRetrievalRequested: {
    intentTtlSeconds: 613,
    maxAttempts: 17,
    policyVersion: 91_020,
  },
};

export function installSyntheticStaffPushPolicyEnvironment(): () => void {
  const prior = {
    intentTtl: process.env.STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS,
    maxAttempts: process.env.STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS,
    version: process.env.STAFF_PUSH_RETRIEVAL_POLICY_VERSION,
  };
  process.env.STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS = "613";
  process.env.STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS = "17";
  process.env.STAFF_PUSH_RETRIEVAL_POLICY_VERSION = "91020";
  return () => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("STAFF_PUSH_RETRIEVAL_INTENT_TTL_SECONDS", prior.intentTtl);
    restore("STAFF_PUSH_RETRIEVAL_MAX_ATTEMPTS", prior.maxAttempts);
    restore("STAFF_PUSH_RETRIEVAL_POLICY_VERSION", prior.version);
  };
}
