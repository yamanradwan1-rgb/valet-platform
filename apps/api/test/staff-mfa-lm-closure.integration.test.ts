import { generate } from "otplib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaSelfRecoveryBeginResponseSchema,
} from "@valet/contracts";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
const prefix = "/v1/staff/auth/mfa";

async function totp(secret: string, offset = 0) {
  const clock = await fixture.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: (Math.floor(clock.rows[0]!.now.getTime() / 30_000) + offset) * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

describe("T05-F existing LM-only MFA ceremony closure", () => {
  it("enrolls, verifies, steps up and recovers one LM-only account without Company Admin authority", async () => {
    const user = await fixture.createUser();
    const member = await fixture.createMembership(user.id, {
      role: "LOCATION_MANAGER",
    });
    const auth = await fixture.nativeLogin(user);
    const begun = await fixture.postMfa(
      `${prefix}/enrollment/begin`,
      auth.accessToken,
    );
    expect(begun.status).toBe(200);
    const begin = staffMfaEnrollmentBeginResponseSchema.parse(begun.body);
    const confirmation = await fixture.postMfa(
      `${prefix}/enrollment/confirm`,
      auth.accessToken,
      {
        factorId: begin.factorId,
        code: await totp(begin.provisioning.secretBase32),
      },
    );
    expect(confirmation.status).toBe(200);
    const verified = staffMfaEnrollmentConfirmResponseSchema.parse(
      confirmation.body,
    );
    expect(
      (await fixture.getMfa(`${prefix}/state`, auth.accessToken)).body?.state,
    ).toBe("ASSURED");
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(
      (
        await fixture.postMfa(`${prefix}/step-up`, auth.accessToken, {
          code: await totp(begin.provisioning.secretBase32, 1),
        })
      ).status,
    ).toBe(200);
    const after = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    expect(after.mfa_authenticated_at!.getTime()).toBeGreaterThanOrEqual(
      before.mfa_authenticated_at!.getTime(),
    );
    const refreshed = await fixture.refresh(auth.refreshToken);
    expect(refreshed.status).toBe(200);
    const nextAccess = String(refreshed.body?.accessToken);
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]
        ?.mfa_authenticated_at,
    ).toEqual(after.mfa_authenticated_at);
    const recovered = await fixture.postMfa(
      `${prefix}/recovery/begin`,
      nextAccess,
      { recoveryCode: verified.recoveryCodes[0] },
    );
    expect(recovered.status).toBe(200);
    const recovery = staffMfaSelfRecoveryBeginResponseSchema.parse(
      recovered.body,
    );
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.mfa_factor_id,
    ).toBe(begin.factorId);
    expect(
      (
        await fixture.query<{ state: string }>(
          "SELECT state::text FROM user_mfa_totp_factors WHERE id=$1",
          [begin.factorId],
        )
      ).rows[0]?.state,
    ).toBe("RETIRED");
    expect(
      (await fixture.getMfa(`${prefix}/state`, nextAccess)).body?.state,
    ).toBe("ENROLLMENT_PENDING");
    expect(
      (await fixture.recoveryCodes(begin.factorId)).rows.filter(
        (r) => r.consumed_at !== null,
      ),
    ).toHaveLength(1);
    expect(
      (
        await fixture.postMfa(`${prefix}/enrollment/confirm`, nextAccess, {
          factorId: recovery.factorId,
          code: await totp(recovery.provisioning.secretBase32),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.managementGet(
          `/v1/staff/management/organizations/${member.organizationId}/integrations`,
          nextAccess,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.query(
          "SELECT role::text FROM organization_memberships WHERE user_id=$1",
          [user.id],
        )
      ).rows,
    ).toEqual([{ role: "LOCATION_MANAGER" }]);
  }, 30_000);

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies management MFA enrollment, step-up and recovery to %s",
    async (role) => {
      const user = await fixture.createUser();
      await fixture.createMembership(user.id, { role });
      const auth = await fixture.nativeLogin(user);
      for (const [path, body] of [
        ["enrollment/begin", {}],
        ["step-up", { code: "123456" }],
        [
          "recovery/begin",
          { recoveryCode: `vmr1-${"A".repeat(11)}-${"B".repeat(27)}` },
        ],
      ] as const) {
        const response = await fixture.postMfa(
          `${prefix}/${path}`,
          auth.accessToken,
          body,
        );
        expect(response.status).toBe(409);
        expect(response.body?.code).toBe("MFA_ENROLLMENT_NOT_AVAILABLE");
      }
    },
  );

  it.each(["membership", "organization", "user", "session"])(
    "denies existing LM enrollment after %s invalidation",
    async (loss) => {
      const user = await fixture.createUser();
      const member = await fixture.createMembership(user.id, {
        role: "LOCATION_MANAGER",
      });
      const auth = await fixture.nativeLogin(user);
      const commands: Record<string, [string, unknown[]]> = {
        membership: [
          "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
          [member.membershipId],
        ],
        organization: [
          "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
          [member.organizationId],
        ],
        user: ["UPDATE users SET status='DISABLED' WHERE id=$1", [user.id]],
        session: [
          "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
          [auth.sessionId],
        ],
      };
      const [sql, values] = commands[loss]!;
      await fixture.query(sql, values);
      expect(
        (await fixture.postMfa(`${prefix}/enrollment/begin`, auth.accessToken))
          .status,
      ).toBe(loss === "membership" || loss === "organization" ? 409 : 401);
    },
  );
});
