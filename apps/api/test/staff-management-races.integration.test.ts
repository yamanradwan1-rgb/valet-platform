import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function rolePath(organizationId: string, membershipId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}/role`;
}

async function createTwoUsableAdmins() {
  const firstUser = await fixture.createUser();
  const first = await fixture.createMembership(firstUser.id);
  const secondUser = await fixture.createUser();
  const secondId = await fixture.addMembership(
    first.organizationId,
    secondUser.id,
    "ORG_ADMIN",
  );
  const firstAuth = await fixture.nativeLogin(firstUser);
  const secondAuth = await fixture.nativeLogin(secondUser);
  await Promise.all([
    fixture.enrollAndAssure(firstAuth),
    fixture.enrollAndAssure(secondAuth),
  ]);
  return {
    first: { auth: firstAuth, membershipId: first.membershipId },
    organizationId: first.organizationId,
    second: { auth: secondAuth, membershipId: secondId },
  };
}

function demote(
  organizationId: string,
  membershipId: string,
  accessToken: string,
) {
  return fixture.managementPost(
    rolePath(organizationId, membershipId),
    accessToken,
    { expectedVersion: 1, role: "VALET_EMPLOYEE" },
  );
}

describe("MGT-BE-04 last usable Company Admin races", () => {
  it("serializes two concurrent self-demotions so exactly one commits", async () => {
    const pair = await createTwoUsableAdmins();
    const results = await Promise.all([
      demote(pair.organizationId, pair.first.membershipId, pair.first.auth.accessToken),
      demote(pair.organizationId, pair.second.membershipId, pair.second.auth.accessToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.body).toMatchObject({
      code: "LAST_USABLE_ADMIN_REQUIRED",
    });
    const remaining = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM organization_memberships AS membership
       INNER JOIN users AS staff_user ON staff_user.id=membership.user_id
       WHERE membership.organization_id=$1 AND membership.role='ORG_ADMIN'
         AND membership.status='ACTIVE' AND staff_user.status='ACTIVE'
         AND EXISTS(
           SELECT 1 FROM user_mfa_totp_factors AS factor
           WHERE factor.user_id=membership.user_id AND factor.state='ACTIVE'
         )`,
      [pair.organizationId],
    );
    expect(remaining.rows[0]?.count).toBe("1");
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND event_type='STAFF_ROLE_CHANGED'`,
      [pair.organizationId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  }, 30_000);

  it("serializes cross-demotion without write skew or deadlock", async () => {
    const pair = await createTwoUsableAdmins();
    const results = await Promise.all([
      demote(pair.organizationId, pair.second.membershipId, pair.first.auth.accessToken),
      demote(pair.organizationId, pair.first.membershipId, pair.second.auth.accessToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 404]);
    const roles = await fixture.query<{ role: string }>(
      `SELECT role::text FROM organization_memberships
       WHERE organization_id=$1 ORDER BY id`,
      [pair.organizationId],
    );
    expect(roles.rows.filter((row) => row.role === "ORG_ADMIN")).toHaveLength(1);
  }, 30_000);
});
