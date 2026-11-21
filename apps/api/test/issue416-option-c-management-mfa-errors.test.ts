import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import { setStaffRole } from "../src/modules/management/staff-management-mutation-repository";
import { throwStaffOnboardingDatabaseError } from "../src/modules/management/staff-onboarding-errors";

const context = {
  createdAt: new Date(0),
  rawAccessToken: "vsa1.test",
  staffAuthSessionId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
};

const mutation = {
  actorMembershipId: "00000000-0000-0000-0000-000000000003",
  expectedVersion: 1,
  membershipId: "00000000-0000-0000-0000-000000000004",
  organizationId: "00000000-0000-0000-0000-000000000005",
  role: "VALET_SUPERVISOR" as const,
};

describe("Option C Management database error contract", () => {
  it("maps protected-writer MFA soft denial to the existing step-up error", async () => {
    const transaction = {
      query: () =>
        Promise.reject({ code: "P0001", message: "MFA_STEP_UP_REQUIRED" }),
    } as unknown as PostgresTransaction;
    await expect(
      setStaffRole(transaction, context, mutation),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);
    expect(() =>
      throwStaffOnboardingDatabaseError({
        code: "P0001",
        message: "MFA_STEP_UP_REQUIRED",
      }),
    ).toThrow(MfaStepUpRequiredError);
  });

  it("keeps invalid protected-writer authority concealed", async () => {
    const transaction = {
      query: () =>
        Promise.reject({ code: "42501", message: "AUTHORIZATION_DENIED" }),
    } as unknown as PostgresTransaction;
    await expect(
      setStaffRole(transaction, context, mutation),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(() =>
      throwStaffOnboardingDatabaseError({
        code: "42501",
        message: "AUTHORIZATION_DENIED",
      }),
    ).toThrow(ManagementAccessDeniedError);
  });
});
