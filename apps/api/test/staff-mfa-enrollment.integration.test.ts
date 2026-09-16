import { generate } from "otplib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaRecoveryCodesReissueResponseSchema,
  staffMfaSelfRecoveryBeginResponseSchema,
  staffMfaStepUpResponseSchema,
} from "@valet/contracts";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const routes = {
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  recover: "/v1/staff/auth/mfa/recovery/begin",
  reissue: "/v1/staff/auth/mfa/recovery-codes/reissue",
  stepUp: "/v1/staff/auth/mfa/step-up",
} as const;
const fixture = new StaffMfaTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function totp(secret: string, offset = 0) {
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30) + offset;
  const code = await generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
  return { code, step };
}

async function enrolledAdmin() {
  const admin = await fixture.createCompanyAdmin();
  const auth = await fixture.nativeLogin(admin);
  const begun = await fixture.postMfa(routes.begin, auth.accessToken);
  expect(begun.status).toBe(200);
  const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
  const confirmationCode = await totp(begin.provisioning.secretBase32);
  const confirmed = await fixture.postMfa(routes.confirm, auth.accessToken, {
    code: confirmationCode.code,
    factorId: begin.factorId,
  });
  expect(confirmed.status).toBe(200);
  const confirmation = staffMfaEnrollmentConfirmResponseSchema.parse(
    confirmed.body,
  );
  return { admin, auth, begin, confirmation, confirmationCode };
}

describe("MGT-BE-02 MFA enrollment and one-time verification", () => {
  it("requires Company Admin eligibility and converges repeated begin on one pending factor", async () => {
    const employee = await fixture.createUser();
    const employeeAuth = await fixture.nativeLogin(employee);
    const denied = await fixture.postMfa(
      routes.begin,
      employeeAuth.accessToken,
    );
    expect(denied.status).toBe(409);
    expect(denied.body).toMatchObject({ code: "MFA_ENROLLMENT_NOT_AVAILABLE" });

    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    const first = await fixture.postMfa(routes.begin, auth.accessToken);
    const second = await fixture.postMfa(routes.begin, auth.accessToken);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = staffMfaEnrollmentBeginResponseSchema.parse(first.body);
    const secondBody = staffMfaEnrollmentBeginResponseSchema.parse(second.body);
    expect(secondBody).toEqual(firstBody);

    const factors = await fixture.factors(admin.userId);
    expect(factors.rows).toEqual([
      expect.objectContaining({ id: firstBody.factorId, state: "PENDING" }),
    ]);
  });

  it("activates once, discloses exactly ten recovery codes, and rejects TOTP replay", async () => {
    const { admin, auth, begin, confirmation, confirmationCode } =
      await enrolledAdmin();
    expect(confirmation.recoveryCodes).toHaveLength(10);
    expect(new Set(confirmation.recoveryCodes).size).toBe(10);

    const factors = await fixture.factors(admin.userId);
    expect(factors.rows).toEqual([
      expect.objectContaining({ id: begin.factorId, state: "ACTIVE" }),
    ]);
    const recovery = await fixture.recoveryCodes(begin.factorId);
    expect(recovery.rows).toHaveLength(10);
    expect(recovery.rows.every((row) => row.consumed_at === null)).toBe(true);
    const session = await fixture.sessionSnapshot(auth.sessionId);
    expect(session.rows[0]).toMatchObject({
      mfa_factor_id: begin.factorId,
      revoked_at: null,
    });
    expect(session.rows[0]?.mfa_authenticated_at).toBeInstanceOf(Date);

    const replay = await fixture.postMfa(routes.stepUp, auth.accessToken, {
      code: confirmationCode.code,
    });
    expect(replay.status).not.toBe(200);
    expect(replay.body).toMatchObject({ code: "MFA_VERIFICATION_FAILED" });
  });

  it("reissues a fresh ten-code set after lost disclosure and retires the prior set", async () => {
    const { auth, begin, confirmation } = await enrolledAdmin();
    const next = await totp(begin.provisioning.secretBase32, 1);
    const reissued = await fixture.postMfa(routes.reissue, auth.accessToken, {
      code: next.code,
    });
    expect(reissued.status).toBe(200);
    const body = staffMfaRecoveryCodesReissueResponseSchema.parse(
      reissued.body,
    );
    expect(body.factorId).toBe(begin.factorId);
    expect(body.recoveryCodes).toHaveLength(10);
    expect(new Set(body.recoveryCodes).size).toBe(10);
    expect(body.recoveryCodes).not.toEqual(confirmation.recoveryCodes);

    const rows = await fixture.recoveryCodes(begin.factorId);
    expect(rows.rows).toHaveLength(20);
    expect(new Set(rows.rows.map((row) => row.set_generation))).toEqual(
      new Set([1, 2]),
    );
    const oldCode = await fixture.postMfa(routes.recover, auth.accessToken, {
      recoveryCode: confirmation.recoveryCodes[0],
    });
    expect(oldCode.status).not.toBe(200);
    expect(oldCode.body).toMatchObject({ code: "MFA_VERIFICATION_FAILED" });
  });

  it("serializes concurrent TOTP step-up so one time-step succeeds once", async () => {
    const { admin, auth, begin } = await enrolledAdmin();
    const next = await totp(begin.provisioning.secretBase32, 1);
    const attempts = await Promise.all([
      fixture.postMfa(routes.stepUp, auth.accessToken, { code: next.code }),
      fixture.postMfa(routes.stepUp, auth.accessToken, { code: next.code }),
    ]);
    const successes = attempts.filter((result) => result.status === 200);
    const failures = attempts.filter((result) => result.status !== 200);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(staffMfaStepUpResponseSchema.parse(successes[0]!.body)).toEqual({
      state: "ASSURED",
    });
    expect(failures[0]!.body).toMatchObject({
      code: "MFA_VERIFICATION_FAILED",
    });

    const factors = await fixture.factors(admin.userId);
    expect(factors.rows).toEqual([
      expect.objectContaining({
        id: begin.factorId,
        last_accepted_step: String(next.step),
        state: "ACTIVE",
      }),
    ]);
  });

  it("consumes one recovery code once under concurrency and starts one replacement factor", async () => {
    const { admin, auth, begin, confirmation } = await enrolledAdmin();
    const recoveryCode = confirmation.recoveryCodes[0]!;
    const attempts = await Promise.all([
      fixture.postMfa(routes.recover, auth.accessToken, { recoveryCode }),
      fixture.postMfa(routes.recover, auth.accessToken, { recoveryCode }),
    ]);
    const successes = attempts.filter((result) => result.status === 200);
    const failures = attempts.filter((result) => result.status !== 200);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    staffMfaSelfRecoveryBeginResponseSchema.parse(successes[0]!.body);
    expect(failures[0]!.body).toMatchObject({
      code: "MFA_VERIFICATION_FAILED",
    });

    const oldCodes = await fixture.recoveryCodes(begin.factorId);
    expect(
      oldCodes.rows.filter((row) => row.consumed_at !== null),
    ).toHaveLength(1);
    const factors = await fixture.factors(admin.userId);
    expect(factors.rows.filter((row) => row.state === "RETIRED")).toHaveLength(
      1,
    );
    expect(factors.rows.filter((row) => row.state === "PENDING")).toHaveLength(
      1,
    );

    const replay = await fixture.postMfa(routes.recover, auth.accessToken, {
      recoveryCode,
    });
    expect(replay.status).not.toBe(200);
    expect(replay.body).toMatchObject({ code: "MFA_VERIFICATION_FAILED" });
  });
});
