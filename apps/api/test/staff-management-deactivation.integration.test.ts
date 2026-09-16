import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { authorizeCustodyActorForPersistedScope } from "../src/modules/staff/custody-staff-authorizer";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

describe("MGT-BE-04 tenant membership deactivation", () => {
  it("removes only Organization A authority while preserving User, Organization B, session and push", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const membershipA = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const organizationB = await fixture.createOrganization();
    const membershipB = await fixture.addMembership(organizationB, target.id, "VALET_EMPLOYEE");
    const locationA = await fixture.addLocation(actor.membership.organizationId);
    const locationB = await fixture.addLocation(organizationB);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3),($4,$5,$6)`,
      [
        actor.membership.organizationId,
        membershipA,
        locationA.locationId,
        organizationB,
        membershipB,
        locationB.locationId,
      ],
    );
    const targetAuth = await fixture.nativeLogin(target);
    const pushId = randomUUID();
    await fixture.query(
      `INSERT INTO staff_push_registrations
         (id,staff_auth_session_id,provider,platform,app_identifier,installation_id,
          provider_token,token_hash,app_version,app_build,locale)
       VALUES($1,$2,'FCM','ANDROID','com.vaylet.employee',$3,$4,$5,'1.0.0','1','en')`,
      [
        pushId,
        targetAuth.sessionId,
        randomUUID(),
        `provider-${randomUUID()}`,
        `staff-push-token-sha256:v1:${"d".repeat(64)}`,
      ],
    );

    const deactivated = await fixture.managementPost(
      `/v1/staff/management/organizations/${actor.membership.organizationId}/staff/${membershipA}/deactivate`,
      actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({ status: "INACTIVE", version: 2 });

    const state = await fixture.query<{
      a_status: string;
      a_version: number;
      b_status: string;
      b_version: number;
      user_status: string;
    }>(
      `SELECT user_row.status::text AS user_status,
              membership_a.status::text AS a_status,membership_a.version AS a_version,
              membership_b.status::text AS b_status,membership_b.version AS b_version
       FROM users AS user_row
       INNER JOIN organization_memberships AS membership_a ON membership_a.id=$2
       INNER JOIN organization_memberships AS membership_b ON membership_b.id=$3
       WHERE user_row.id=$1`,
      [target.id, membershipA, membershipB],
    );
    expect(state.rows[0]).toEqual({
      a_status: "INACTIVE",
      a_version: 2,
      b_status: "ACTIVE",
      b_version: 1,
      user_status: "ACTIVE",
    });
    const grants = await fixture.query<{ membership_id: string }>(
      `SELECT membership_id::text FROM membership_location_access
       WHERE membership_id=ANY($1::uuid[]) ORDER BY membership_id`,
      [[membershipA, membershipB]],
    );
    expect(grants.rows.map((row) => row.membership_id).sort()).toEqual(
      [membershipA, membershipB].sort(),
    );
    const session = await fixture.sessionSnapshot(targetAuth.sessionId);
    expect(session.rows[0]?.revoked_at).toBeNull();
    const push = await fixture.query<{ provider_token: string | null; state: string }>(
      `SELECT provider_token,state::text FROM staff_push_registrations WHERE id=$1`,
      [pushId],
    );
    expect(push.rows[0]?.state).toBe("ACTIVE");
    expect(push.rows[0]?.provider_token).not.toBeNull();

    const client = await fixture.databasePool().connect();
    try {
      await client.query("BEGIN");
      await expect(
        authorizeCustodyActorForPersistedScope(client, {
          allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
          authenticatedUserId: target.id,
          resourceScope: {
            locationId: locationA.locationId,
            organizationId: actor.membership.organizationId,
          },
        }),
      ).rejects.toMatchObject({ code: "TENANT_ACCESS_DENIED" });
      await expect(
        authorizeCustodyActorForPersistedScope(client, {
          allowedRoles: ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
          authenticatedUserId: target.id,
          resourceScope: { locationId: locationB.locationId, organizationId: organizationB },
        }),
      ).resolves.toMatchObject({ membershipId: membershipB });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const refreshed = await fixture.refresh(targetAuth.refreshToken);
    expect(refreshed.status).toBe(200);
    const newAccessToken = String(refreshed.body?.accessToken);
    const authState = await fixture.getMfa("/v1/staff/auth/mfa/state", newAccessToken);
    expect(authState.status).toBe(409);
    expect(authState.body).toMatchObject({ code: "MFA_ENROLLMENT_NOT_AVAILABLE" });
    const afterRefresh = await fixture.query<{ status: string }>(
      `SELECT status::text FROM organization_memberships WHERE id=$1`,
      [membershipA],
    );
    expect(afterRefresh.rows[0]?.status).toBe("INACTIVE");
  }, 30_000);
});
