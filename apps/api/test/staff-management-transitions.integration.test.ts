import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  ManagementControlPlaneTestFixture,
  type ManagementTestRole,
} from "./management-control-plane-test-fixture";

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
  return { auth, membership };
}

describe("MGT-BE-04 role transitions and membership revision", () => {
  it("supports the explicit role transition matrix without fabricating Location access", async () => {
    const actor = await assuredAdmin();
    const transitions: ReadonlyArray<readonly [ManagementTestRole, ManagementTestRole]> = [
      ["ORG_ADMIN", "LOCATION_MANAGER"],
      ["ORG_ADMIN", "VALET_SUPERVISOR"],
      ["ORG_ADMIN", "VALET_EMPLOYEE"],
      ["LOCATION_MANAGER", "VALET_SUPERVISOR"],
      ["LOCATION_MANAGER", "VALET_EMPLOYEE"],
      ["VALET_SUPERVISOR", "VALET_EMPLOYEE"],
      ["VALET_EMPLOYEE", "VALET_SUPERVISOR"],
      ["VALET_EMPLOYEE", "ORG_ADMIN"],
      ["VALET_SUPERVISOR", "ORG_ADMIN"],
    ];

    for (const [from, to] of transitions) {
      const user = await fixture.createUser();
      const membershipId = await fixture.addMembership(
        actor.membership.organizationId,
        user.id,
        from,
      );
      const path = `${staffPath(actor.membership.organizationId, membershipId)}/role`;
      const changed = await fixture.managementPost(path, actor.auth.accessToken, {
        expectedVersion: 1,
        role: to,
      });
      expect(changed.status, `${from} -> ${to}`).toBe(201);
      expect(changed.body).toMatchObject({
        locationAccessCount: 0,
        role: to,
        version: 2,
      });
      const retry = await fixture.managementPost(path, actor.auth.accessToken, {
        expectedVersion: 1,
        role: to,
      });
      expect(retry.status, `${from} -> ${to} retry`).toBe(201);
      expect(retry.body).toMatchObject({ role: to, version: 2 });
      const audit = await fixture.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_events
         WHERE entity_id=$1 AND event_type='STAFF_ROLE_CHANGED'`,
        [membershipId],
      );
      expect(audit.rows[0]?.count).toBe("1");
    }
  }, 30_000);

  it("keeps live work valid within operational roles and blocks reductions out of them", async () => {
    const actor = await assuredAdmin();
    const user = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      user.id,
      "VALET_EMPLOYEE",
    );
    const location = await fixture.addLocation(actor.membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [actor.membership.organizationId, membershipId, location.locationId],
    );
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [randomUUID(), actor.membership.organizationId, location.locationId, membershipId],
    );
    const path = `${staffPath(actor.membership.organizationId, membershipId)}/role`;
    const promoted = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(promoted.status).toBe(201);
    expect(promoted.body).toMatchObject({ role: "VALET_SUPERVISOR", version: 2 });
    const reduced = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 2,
      role: "VALET_EMPLOYEE",
    });
    expect(reduced.status).toBe(201);
    expect(reduced.body).toMatchObject({ role: "VALET_EMPLOYEE", version: 3 });
    const blocked = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 3,
      role: "ORG_ADMIN",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
  });

  it("requires explicit dormant-grant reconciliation before ORG_ADMIN demotion", async () => {
    const actor = await assuredAdmin();
    const user = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      user.id,
      "ORG_ADMIN",
    );
    const location = await fixture.addLocation(actor.membership.organizationId);
    const base = staffPath(actor.membership.organizationId, membershipId);
    const granted = await fixture.managementPost(
      `${base}/location-access/grant`,
      actor.auth.accessToken,
      { expectedVersion: 1, locationIds: [location.locationId] },
    );
    expect(granted.status).toBe(201);
    expect(granted.body).toMatchObject({ locationAccessCount: 1, version: 2 });
    const grantRetry = await fixture.managementPost(
      `${base}/location-access/grant`,
      actor.auth.accessToken,
      { expectedVersion: 1, locationIds: [location.locationId] },
    );
    expect(grantRetry.body).toMatchObject({ locationAccessCount: 1, version: 2 });
    const blocked = await fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
      expectedVersion: 2,
      role: "LOCATION_MANAGER",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_ACCESS_INVALID_STATE" });
    const revoked = await fixture.managementPost(
      `${base}/location-access/revoke`,
      actor.auth.accessToken,
      { expectedVersion: 2, locationIds: [location.locationId] },
    );
    expect(revoked.body).toMatchObject({ locationAccessCount: 0, version: 3 });
    const revokeRetry = await fixture.managementPost(
      `${base}/location-access/revoke`,
      actor.auth.accessToken,
      { expectedVersion: 2, locationIds: [location.locationId] },
    );
    expect(revokeRetry.body).toMatchObject({ locationAccessCount: 0, version: 3 });
    const demoted = await fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
      expectedVersion: 3,
      role: "LOCATION_MANAGER",
    });
    expect(demoted.body).toMatchObject({ role: "LOCATION_MANAGER", version: 4 });
    const intentional = await fixture.managementPost(
      `${base}/location-access/grant`,
      actor.auth.accessToken,
      { expectedVersion: 4, locationIds: [location.locationId] },
    );
    expect(intentional.body).toMatchObject({ locationAccessCount: 1, version: 5 });
  });

  it("uses one monotonic membership revision across grant, role, status and revoke", async () => {
    const actor = await assuredAdmin();
    const user = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      user.id,
      "VALET_EMPLOYEE",
    );
    const location = await fixture.addLocation(actor.membership.organizationId);
    const base = staffPath(actor.membership.organizationId, membershipId);
    const grant = await fixture.managementPost(`${base}/location-access/grant`, actor.auth.accessToken, {
      expectedVersion: 1,
      locationIds: [location.locationId],
    });
    expect(grant.body).toMatchObject({ version: 2 });
    const role = await fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
      expectedVersion: 2,
      role: "VALET_SUPERVISOR",
    });
    expect(role.body).toMatchObject({ version: 3 });
    const deactivate = await fixture.managementPost(`${base}/deactivate`, actor.auth.accessToken, {
      expectedVersion: 3,
    });
    expect(deactivate.body).toMatchObject({ status: "INACTIVE", version: 4 });
    const stale = await fixture.managementPost(`${base}/activate`, actor.auth.accessToken, {
      expectedVersion: 3,
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "VERSION_CONFLICT" });
    const revoke = await fixture.managementPost(`${base}/location-access/revoke`, actor.auth.accessToken, {
      expectedVersion: 4,
      locationIds: [location.locationId],
    });
    expect(revoke.body).toMatchObject({ version: 5 });
    const activate = await fixture.managementPost(`${base}/activate`, actor.auth.accessToken, {
      expectedVersion: 5,
    });
    expect(activate.body).toMatchObject({ status: "ACTIVE", version: 6 });
    const retry = await fixture.managementPost(`${base}/activate`, actor.auth.accessToken, {
      expectedVersion: 5,
    });
    expect(retry.body).toMatchObject({ status: "ACTIVE", version: 6 });
  });

  it("serializes conflicting role writes and independent grant/revoke writes on one revision", async () => {
    const actor = await assuredAdmin();
    const user = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      user.id,
      "VALET_EMPLOYEE",
    );
    const first = await fixture.addLocation(actor.membership.organizationId);
    const second = await fixture.addLocation(actor.membership.organizationId);
    const third = await fixture.addLocation(actor.membership.organizationId);
    const base = staffPath(actor.membership.organizationId, membershipId);
    const roleResults = await Promise.all([
      fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
        expectedVersion: 1,
        role: "VALET_SUPERVISOR",
      }),
      fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
        expectedVersion: 1,
        role: "LOCATION_MANAGER",
      }),
    ]);
    expect(roleResults.map((result) => result.status).sort()).toEqual([201, 409]);
    const current = await fixture.query<{ version: number }>(
      `SELECT version FROM organization_memberships WHERE id=$1`,
      [membershipId],
    );
    expect(current.rows[0]?.version).toBe(2);
    await fixture.managementPost(`${base}/location-access/grant`, actor.auth.accessToken, {
      expectedVersion: 2,
      locationIds: [first.locationId],
    });
    const mixed = await fixture.managementPost(
      `${base}/location-access/grant`,
      actor.auth.accessToken,
      { expectedVersion: 3, locationIds: [first.locationId, second.locationId] },
    );
    expect(mixed.body).toMatchObject({ locationAccessCount: 2, version: 4 });
    const mixedAudit = await fixture.query<{ location_count: string }>(
      `SELECT metadata_json->>'locationCount' AS location_count FROM audit_events
       WHERE entity_id=$1 AND event_type='STAFF_LOCATION_ACCESS_GRANTED'
       ORDER BY occurred_at DESC,id DESC LIMIT 1`,
      [membershipId],
    );
    expect(mixedAudit.rows[0]?.location_count).toBe("1");
    const accessResults = await Promise.all([
      fixture.managementPost(`${base}/location-access/grant`, actor.auth.accessToken, {
        expectedVersion: 4,
        locationIds: [third.locationId],
      }),
      fixture.managementPost(`${base}/location-access/revoke`, actor.auth.accessToken, {
        expectedVersion: 4,
        locationIds: [first.locationId],
      }),
    ]);
    expect(accessResults.map((result) => result.status).sort()).toEqual([201, 409]);
    const final = await fixture.query<{ version: number }>(
      `SELECT version FROM organization_memberships WHERE id=$1`,
      [membershipId],
    );
    expect(final.rows[0]?.version).toBe(5);
  });
});
