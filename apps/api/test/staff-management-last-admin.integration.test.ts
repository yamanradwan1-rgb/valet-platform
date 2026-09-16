import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

async function addSecondAdmin(organizationId: string) {
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
  const auth = await fixture.nativeLogin(user);
  return { auth, membershipId, user };
}

async function selfDemote(actor: Awaited<ReturnType<typeof assuredAdmin>>) {
  return fixture.managementPost(
    `${staffPath(actor.membership.organizationId, actor.membership.membershipId)}/role`,
    actor.auth.accessToken,
    { expectedVersion: 1, role: "VALET_EMPLOYEE" },
  );
}

describe("MGT-BE-04 last usable Company Admin definition", () => {
  it("blocks a single usable admin from self-demotion and self-deactivation", async () => {
    const demotionActor = await assuredAdmin();
    const demotion = await selfDemote(demotionActor);
    expect(demotion.status).toBe(409);
    expect(demotion.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });

    const deactivationActor = await assuredAdmin();
    const deactivation = await fixture.managementPost(
      `${staffPath(
        deactivationActor.membership.organizationId,
        deactivationActor.membership.membershipId,
      )}/deactivate`,
      deactivationActor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivation.status).toBe(409);
    expect(deactivation.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });
  });

  it("does not count disabled, inactive, PENDING or RETIRED alternate admins", async () => {
    const scenarios = ["USER_DISABLED", "MEMBERSHIP_INACTIVE", "PENDING", "RETIRED"] as const;
    for (const scenario of scenarios) {
      const actor = await assuredAdmin();
      const second = await addSecondAdmin(actor.membership.organizationId);
      if (scenario === "PENDING") {
        const begun = await fixture.postMfa(
          "/v1/staff/auth/mfa/enrollment/begin",
          second.auth.accessToken,
        );
        expect(begun.status).toBe(200);
      } else {
        const factor = await fixture.enrollAndAssure(second.auth);
        if (scenario === "RETIRED") {
          await fixture.query(
            `UPDATE user_mfa_totp_factors
             SET state='RETIRED',retired_at=clock_timestamp()
             WHERE id=$1`,
            [factor.factorId],
          );
        }
      }
      if (scenario === "USER_DISABLED") {
        await fixture.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [second.user.id]);
      }
      if (scenario === "MEMBERSHIP_INACTIVE") {
        await fixture.query(
          `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
          [second.membershipId],
        );
      }
      const blocked = await selfDemote(actor);
      expect(blocked.status, scenario).toBe(409);
      expect(blocked.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });
    }
  }, 30_000);

  it("counts an ACTIVE factor without requiring a live session, step-up or admin activity", async () => {
    const actor = await assuredAdmin();
    const second = await addSecondAdmin(actor.membership.organizationId);
    await fixture.enrollAndAssure(second.auth);
    const logout = await fixture.logout(second.auth.refreshToken);
    expect(logout.status).toBe(204);
    const session = await fixture.sessionSnapshot(second.auth.sessionId);
    expect(session.rows[0]?.revoked_at).toBeInstanceOf(Date);

    const demoted = await selfDemote(actor);
    expect(demoted.status).toBe(201);
    expect(demoted.body).toMatchObject({ role: "VALET_EMPLOYEE", version: 2 });
  });

  it("lets one of two usable admins deactivate and ignores a promoted admin without ACTIVE MFA", async () => {
    const actor = await assuredAdmin();
    const second = await addSecondAdmin(actor.membership.organizationId);
    await fixture.enrollAndAssure(second.auth);
    const deactivated = await fixture.managementPost(
      `${staffPath(actor.membership.organizationId, actor.membership.membershipId)}/deactivate`,
      actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({ status: "INACTIVE", version: 2 });

    const freshActor = await assuredAdmin();
    const promotedUser = await fixture.createUser();
    const promotedId = await fixture.addMembership(
      freshActor.membership.organizationId,
      promotedUser.id,
      "VALET_EMPLOYEE",
    );
    const promoted = await fixture.managementPost(
      `${staffPath(freshActor.membership.organizationId, promotedId)}/role`,
      freshActor.auth.accessToken,
      { expectedVersion: 1, role: "ORG_ADMIN" },
    );
    expect(promoted.status).toBe(201);
    const blocked = await selfDemote(freshActor);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });
  });
});
