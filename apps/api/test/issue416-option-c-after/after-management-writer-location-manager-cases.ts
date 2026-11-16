import { expect } from "vitest";

import type { OptionCAfterProtectedFixture } from "./after-protected-fixture";

export async function assertLocationManagerScope(
  fixture: OptionCAfterProtectedFixture,
) {
  const companyAdmin = await fixture.onboardingAdmin();
  const organizationId = companyAdmin.membership.organizationId;
  const allowedLocationId = companyAdmin.locationId;
  const outsideLocation = await fixture.addLocation(organizationId);
  const manager = await fixture.createUser();
  const managerMembershipId = await fixture.addMembership(
    organizationId,
    manager.id,
    "LOCATION_MANAGER",
  );
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, managerMembershipId, allowedLocationId],
  );
  const auth = await fixture.nativeLogin(manager);
  await fixture.enrollAndAssure(auth);

  const allowedTarget = await fixture.employee(organizationId);
  await fixture.query(
    "DELETE FROM membership_location_access WHERE organization_id=$1 AND membership_id=$2",
    [organizationId, allowedTarget.membershipId],
  );
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, allowedTarget.membershipId, allowedLocationId],
  );
  const outsideTarget = await fixture.employee(organizationId);
  const allowedPath = `/v1/staff/management/organizations/${organizationId}/staff/${allowedTarget.membershipId}`;
  const outsidePath = `/v1/staff/management/organizations/${organizationId}/staff/${outsideTarget.membershipId}`;

  const outsideGrant = await fixture.managementPost(
    `${allowedPath}/location-access/grant`,
    auth.accessToken,
    { expectedVersion: 1, locationIds: [outsideLocation.locationId] },
  );
  expect(outsideGrant.status).toBe(404);
  const allowedMutation = await fixture.managementPost(
    `${allowedPath}/deactivate`,
    auth.accessToken,
    { expectedVersion: 1 },
  );
  expect(allowedMutation.status).toBe(201);
  expect(allowedMutation.body).toMatchObject({
    status: "INACTIVE",
    version: 2,
  });
  const outsideMutation = await fixture.managementPost(
    `${outsidePath}/deactivate`,
    auth.accessToken,
    { expectedVersion: 1 },
  );
  expect(outsideMutation.status).toBe(404);

  const target = await fixture.query<{ status: string; version: number }>(
    "SELECT status::text,version FROM organization_memberships WHERE id=$1",
    [outsideTarget.membershipId],
  );
  expect(target.rows[0]).toEqual({ status: "ACTIVE", version: 1 });
  const audit = await fixture.query<{ actor_membership_id: string }>(
    `SELECT actor_membership_id::text FROM audit_events
     WHERE organization_id=$1 AND entity_id=$2
       AND event_type='STAFF_MEMBERSHIP_DEACTIVATED'`,
    [organizationId, allowedTarget.membershipId],
  );
  expect(audit.rows).toEqual([{ actor_membership_id: managerMembershipId }]);
}
