import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId?: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff${
    membershipId === undefined ? "" : `/${membershipId}`
  }`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

describe("MGT-BE-04 Staff, Roles & Access", () => {
  it("returns a bounded minimal directory and conceals foreign memberships", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const targetId = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const foreign = await fixture.createMembership(target.id, {
      role: "LOCATION_MANAGER",
    });

    const directory = await fixture.managementGet(
      `${staffPath(actor.membership.organizationId)}?limit=1`,
      actor.auth.accessToken,
    );
    expect(directory.status).toBe(200);
    const directoryBody = directory.body as
      | { readonly items?: readonly unknown[] }
      | undefined;
    expect(directoryBody?.items).toHaveLength(1);
    expect(Object.keys(directoryBody?.items?.[0] as object).sort()).toEqual(
      ["identity", "locationAccessCount", "membershipId", "role", "status", "version"].sort(),
    );

    const detail = await fixture.managementGet(
      staffPath(actor.membership.organizationId, targetId),
      actor.auth.accessToken,
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      membershipId: targetId,
      role: "VALET_EMPLOYEE",
      status: "ACTIVE",
      version: 1,
    });
    expect(Object.keys(detail.body ?? {}).sort()).toEqual(
      ["identity", "locationAccess", "locationAccessCount", "membershipId", "role", "status", "version"].sort(),
    );
    const concealed = await fixture.managementGet(
      staffPath(actor.membership.organizationId, foreign.membershipId),
      actor.auth.accessToken,
    );
    expect(concealed.status).toBe(404);
    expect(concealed.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("uses desired-state role CAS without duplicate version or audit", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const path = `${staffPath(actor.membership.organizationId, membershipId)}/role`;
    const changed = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(changed.status).toBe(201);
    expect(changed.body).toMatchObject({ role: "VALET_SUPERVISOR", version: 2 });

    const retry = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_SUPERVISOR",
    });
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ role: "VALET_SUPERVISOR", version: 2 });
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND entity_id=$2 AND event_type='STAFF_ROLE_CHANGED'`,
      [actor.membership.organizationId, membershipId],
    );
    expect(audit.rows[0]?.count).toBe("1");

    const stale = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "LOCATION_MANAGER",
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("counts only MFA-capable active admins for self-demotion", async () => {
    const actor = await assuredAdmin();
    const path = `${staffPath(
      actor.membership.organizationId,
      actor.membership.membershipId,
    )}/role`;
    const onlyAdmin = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_EMPLOYEE",
    });
    expect(onlyAdmin.status).toBe(409);
    expect(onlyAdmin.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });

    const second = await fixture.createUser();
    await fixture.addMembership(
      actor.membership.organizationId,
      second.id,
      "ORG_ADMIN",
    );
    const stillLast = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_EMPLOYEE",
    });
    expect(stillLast.body).toMatchObject({ code: "LAST_USABLE_ADMIN_REQUIRED" });

    const secondAuth = await fixture.nativeLogin(second);
    await fixture.enrollAndAssure(secondAuth);
    const demoted = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "VALET_EMPLOYEE",
    });
    expect(demoted.status).toBe(201);
    expect(demoted.body).toMatchObject({ role: "VALET_EMPLOYEE", version: 2 });
  });

  it("prevents dormant grants from becoming authority on ORG_ADMIN demotion", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "ORG_ADMIN",
    );
    const location = await fixture.addLocation(actor.membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [actor.membership.organizationId, membershipId, location.locationId],
    );
    const path = `${staffPath(actor.membership.organizationId, membershipId)}/role`;
    const blocked = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "LOCATION_MANAGER",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_ACCESS_INVALID_STATE" });
  });

  it("blocks only responsibility at a revoked Location", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const first = await fixture.addLocation(actor.membership.organizationId);
    const second = await fixture.addLocation(actor.membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3),($1,$2,$4)`,
      [actor.membership.organizationId, membershipId, first.locationId, second.locationId],
    );
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [randomUUID(), actor.membership.organizationId, second.locationId, membershipId],
    );
    const path = `${staffPath(
      actor.membership.organizationId,
      membershipId,
    )}/location-access/revoke`;
    const safe = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 1,
      locationIds: [first.locationId],
    });
    expect(safe.status).toBe(201);
    expect(safe.body).toMatchObject({ locationAccessCount: 1, version: 2 });
    const blocked = await fixture.managementPost(path, actor.auth.accessToken, {
      expectedVersion: 2,
      locationIds: [second.locationId],
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
  });

  it("blocks live intake ownership until an authorized Parking Task handover", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const targetMembershipId = await fixture.addMembership(
      actor.membership.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const location = await fixture.addLocation(actor.membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [actor.membership.organizationId, targetMembershipId, location.locationId],
    );
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       VALUES($1,$2,'INTAKE-HANDOVER',clock_timestamp())`,
      [vehicleId, actor.membership.organizationId],
    );
    await fixture.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
          checking_in_completed_at,version,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,
              'AWAITING_PARKING',$6,clock_timestamp(),1,clock_timestamp())`,
      [
        sessionId,
        `disabled:intake:${randomUUID()}`,
        actor.membership.organizationId,
        location.locationId,
        vehicleId,
        targetMembershipId,
      ],
    );
    const rolePath = `${staffPath(
      actor.membership.organizationId,
      targetMembershipId,
    )}/role`;
    const blocked = await fixture.managementPost(rolePath, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "LOCATION_MANAGER",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });

    const handoffUser = await fixture.createUser();
    const handoffMembershipId = await fixture.addMembership(
      actor.membership.organizationId,
      handoffUser.id,
      "VALET_EMPLOYEE",
    );
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [actor.membership.organizationId, handoffMembershipId, location.locationId],
    );
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [randomUUID(), actor.membership.organizationId, location.locationId, handoffMembershipId],
    );
    const handoffAuth = await fixture.nativeLogin(handoffUser);
    const queued = await fixture.managementPost(
      `/v1/staff/valet-sessions/${sessionId}/parking-task/queue`,
      handoffAuth.accessToken,
      {},
    );
    expect(queued.status).toBe(200);
    expect(queued.body).toMatchObject({ status: "QUEUED" });

    const changed = await fixture.managementPost(rolePath, actor.auth.accessToken, {
      expectedVersion: 1,
      role: "LOCATION_MANAGER",
    });
    expect(changed.status).toBe(201);
    expect(changed.body).toMatchObject({ role: "LOCATION_MANAGER", version: 2 });
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND entity_id=$2 AND event_type='STAFF_ROLE_CHANGED'`,
      [actor.membership.organizationId, targetMembershipId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  });
});
