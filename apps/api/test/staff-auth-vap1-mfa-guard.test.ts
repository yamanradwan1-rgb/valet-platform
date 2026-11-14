import type { PostgresPool } from "../src/common/database/postgres";
import { describe, expect, it, vi } from "vitest";

import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContextResolver } from "../src/modules/auth/staff-session-context";
import { MfaAntiAbuse } from "../src/modules/auth/mfa/mfa-anti-abuse";
import { MfaEnrollmentService } from "../src/modules/auth/mfa/mfa-enrollment.service";
import { MfaRecoveryService } from "../src/modules/auth/mfa/mfa-recovery.service";
import { MfaStepUpService } from "../src/modules/auth/mfa/mfa-step-up.service";

describe("VAP1 MFA entrypoints do not trust a resolver context without raw Bearer", () => {
  it("denies a forged context across all five MFA write paths before DB/limiter use", async () => {
    const actualAuthorization = `Bearer ${generateStaffCredential("vsa1.")}`;
    const fakeContext = {
      accessTokenHash: staffCredentialHash(
        "access",
        generateStaffCredential("vsa1."),
      ),
      createdAt: new Date(),
      staffAuthSessionId: "00000000-0000-4000-8000-000000000002",
      userId: "00000000-0000-4000-8000-000000000001",
    };
    const resolve = vi.fn().mockResolvedValue(fakeContext);
    const sessions = { resolve } as StaffSessionContextResolver;
    const connect = vi.fn();
    const query = vi.fn();
    const pool = { connect, query } as unknown as PostgresPool;
    const reserveTotp = vi.fn();
    const reserveRecovery = vi.fn();
    const antiAbuse = {
      reserveTotp,
      reserveRecovery,
    } as unknown as MfaAntiAbuse;

    const enrollment = new MfaEnrollmentService(pool, sessions, antiAbuse);
    const recovery = new MfaRecoveryService(pool, sessions, antiAbuse);
    const stepUp = new MfaStepUpService(pool, sessions, antiAbuse);

    for (const operation of [
      () => enrollment.begin(actualAuthorization),
      () =>
        enrollment.confirm(actualAuthorization, {
          code: "123456",
          factorId: "00000000-0000-4000-8000-000000000003",
        }),
      () => stepUp.stepUp(actualAuthorization, "123456"),
      () => recovery.beginSelfRecovery(actualAuthorization, "not-a-code"),
      () => recovery.reissueRecoveryCodes(actualAuthorization, "123456"),
    ]) {
      await expect(operation()).rejects.toMatchObject({ status: 401 });
    }
    expect(resolve).toHaveBeenCalledTimes(5);
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(reserveTotp).not.toHaveBeenCalled();
    expect(reserveRecovery).not.toHaveBeenCalled();
  });
});
