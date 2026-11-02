import { generate } from "otplib";
import { expect } from "vitest";
import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
} from "@valet/contracts";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

export const mfaRoutes = {
  disable: "/v1/staff/auth/mfa/disable",
  state: "/v1/staff/auth/mfa/state",
  begin: "/v1/staff/auth/mfa/enrollment/begin",
  confirm: "/v1/staff/auth/mfa/enrollment/confirm",
  stepUp: "/v1/staff/auth/mfa/step-up",
  recover: "/v1/staff/auth/mfa/recovery/begin",
  reissue: "/v1/staff/auth/mfa/recovery-codes/reissue",
} as const;

export async function totp(f: StaffMfaTestFixture, secret: string, offset = 0) {
  const now = (await f.query<{ now: Date }>("SELECT clock_timestamp() AS now"))
    .rows[0]!.now;
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: (Math.floor(now.getTime() / 30000) + offset) * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

export async function enrolled(
  f: StaffMfaTestFixture,
  role = "LOCATION_MANAGER",
) {
  const user = await f.createCompanyAdmin();
  if (role === "NONE")
    await f.query("DELETE FROM organization_memberships WHERE user_id=$1", [
      user.userId,
    ]);
  else
    await f.query(
      "UPDATE organization_memberships SET role=$2::membership_role WHERE user_id=$1",
      [user.userId, role],
    );
  const auth = await f.nativeLogin(user);
  const result = await f.postMfa(mfaRoutes.begin, auth.accessToken);
  expect(result.status).toBe(200);
  const setup = staffMfaEnrollmentBeginResponseSchema.parse(result.body);
  const confirmation = await f.postMfa(mfaRoutes.confirm, auth.accessToken, {
    factorId: setup.factorId,
    code: await totp(f, setup.provisioning.secretBase32, -1),
  });
  expect(confirmation.status).toBe(200);
  const codes = staffMfaEnrollmentConfirmResponseSchema.parse(
    confirmation.body,
  ).recoveryCodes;
  return { user, auth, setup, codes };
}

export async function disable(
  f: StaffMfaTestFixture,
  owner: Awaited<ReturnType<typeof enrolled>>,
  options: { code?: string; factorId?: string } = {},
) {
  return f.postMfa(mfaRoutes.disable, owner.auth.accessToken, {
    expectedFactorId: options.factorId ?? owner.setup.factorId,
    code:
      options.code ?? (await totp(f, owner.setup.provisioning.secretBase32)),
  });
}

export async function disableEvents(f: StaffMfaTestFixture, userId: string) {
  return (
    await f.query<Record<string, unknown>>(
      "SELECT * FROM account_security_audit_events WHERE subject_user_id=$1 AND event_type='MFA_TOTP_DISABLED'",
      [userId],
    )
  ).rows;
}

export async function badTotp(f: StaffMfaTestFixture, secret: string) {
  const valid = await Promise.all(
    [-1, 0, 1].map((offset) => totp(f, secret, offset)),
  );
  for (let i = 0; i < 1000000; i++) {
    const value = String(i).padStart(6, "0");
    if (!valid.includes(value)) return value;
  }
  throw new Error("No invalid synthetic code.");
}

export { StaffMfaTestFixture };
