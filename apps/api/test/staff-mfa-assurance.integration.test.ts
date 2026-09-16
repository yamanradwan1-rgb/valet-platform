import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaStateResponseSchema,
} from "@valet/contracts";
import { evaluateMfaAssurance } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

const routes = {
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  state: "/v1/staff/auth/mfa/state",
} as const;
const fixture = new StaffMfaTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

async function codeAt(secret: string, offset = 0): Promise<string> {
  const clock = await fixture.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30) + offset;
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

async function enroll(
  accessToken: string,
): Promise<{ factorId: string; secretBase32: string }> {
  const begun = await fixture.postMfa(routes.begin, accessToken);
  expect(begun.status).toBe(200);
  const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
  const code = await codeAt(begin.provisioning.secretBase32);
  const confirmed = await fixture.postMfa(routes.confirm, accessToken, {
    code,
    factorId: begin.factorId,
  });
  expect(confirmed.status).toBe(200);
  staffMfaEnrollmentConfirmResponseSchema.parse(confirmed.body);
  return {
    factorId: begin.factorId,
    secretBase32: begin.provisioning.secretBase32,
  };
}

async function state(accessToken: string) {
  const result = await fixture.getMfa(routes.state, accessToken);
  expect(result.status).toBe(200);
  return staffMfaStateResponseSchema.parse(result.body).state;
}

describe("MGT-BE-02 session-bound MFA assurance", () => {
  it("derives ceremony state from server facts and keeps assurance on the exact session", async () => {
    const admin = await fixture.createCompanyAdmin();
    const first = await fixture.nativeLogin(admin);
    const second = await fixture.nativeLogin(admin);
    expect(await state(first.accessToken)).toBe("ENROLLMENT_REQUIRED");

    const begun = await fixture.postMfa(routes.begin, first.accessToken);
    expect(begun.status).toBe(200);
    const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
    expect(await state(first.accessToken)).toBe("ENROLLMENT_PENDING");
    expect(await state(second.accessToken)).toBe("ENROLLMENT_PENDING");

    const code = await codeAt(begin.provisioning.secretBase32);
    const confirmed = await fixture.postMfa(routes.confirm, first.accessToken, {
      code,
      factorId: begin.factorId,
    });
    expect(confirmed.status).toBe(200);
    expect(await state(first.accessToken)).toBe("ASSURED");
    expect(await state(second.accessToken)).toBe("STEP_UP_REQUIRED");

    const firstSession = await fixture.sessionSnapshot(first.sessionId);
    const secondSession = await fixture.sessionSnapshot(second.sessionId);
    expect(firstSession.rows[0]?.mfa_factor_id).toBe(begin.factorId);
    expect(firstSession.rows[0]?.mfa_authenticated_at).toBeInstanceOf(Date);
    expect(secondSession.rows[0]?.mfa_factor_id).toBeNull();
    expect(secondSession.rows[0]?.mfa_authenticated_at).toBeNull();
  });

  it("preserves assurance timestamps across refresh rotation without sliding them", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    await enroll(auth.accessToken);
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;

    const refreshed = await fixture.refresh(auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextAccess = String(refreshed.body?.accessToken);
    expect(await state(nextAccess)).toBe("ASSURED");

    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.mfa_factor_id).toBe(before.mfa_factor_id);
    expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
    expect(after.last_admin_activity_at).toEqual(before.last_admin_activity_at);
    expect(after.absolute_expires_at).toEqual(before.absolute_expires_at);
  });

  it("uses exact 8h, 30m and 5m assurance boundaries on persisted session facts", async () => {
    const admin = await fixture.createCompanyAdmin();
    const auth = await fixture.nativeLogin(admin);
    await enroll(auth.accessToken);
    const persisted = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    const authenticatedAt = persisted.mfa_authenticated_at!;
    const snapshot = {
      factorCurrent: true,
      lastAdminActivityAt: authenticatedAt,
      mfaAuthenticatedAt: authenticatedAt,
      mfaFactorId: persisted.mfa_factor_id,
    };
    const plus = (milliseconds: number) =>
      new Date(authenticatedAt.getTime() + milliseconds);

    expect(evaluateMfaAssurance(snapshot, plus(5 * 60_000), true)).toBe(
      "ASSURANCE_VALID",
    );
    expect(evaluateMfaAssurance(snapshot, plus(5 * 60_000 + 1), true)).toBe(
      "SENSITIVE_FRESHNESS_EXPIRED",
    );
    expect(evaluateMfaAssurance(snapshot, plus(30 * 60_000), false)).toBe(
      "ADMIN_INACTIVITY_EXPIRED",
    );
    expect(evaluateMfaAssurance(snapshot, plus(8 * 60 * 60_000), false)).toBe(
      "MFA_MAX_AGE_EXPIRED",
    );
  });
});
