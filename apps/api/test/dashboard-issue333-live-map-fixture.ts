import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { fixture } from "./dashboard-issue333-lab";

export const liveMapSentinel = "ISSUE333-SYNTHETIC-LIVE-VEHICLE";

export async function prepareLiveMapScenario() {
  const managerUser = await fixture.createUser();
  const { organizationId, membershipId } = await fixture.createMembership(
    managerUser.id,
    { role: "LOCATION_MANAGER" },
  );
  const { locationId } = await fixture.addLocation(organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
  await fixture.query(
    "UPDATE locations SET tracking_enabled_override=TRUE WHERE id=$1",
    [locationId],
  );
  const employee = await fixture.createUser();
  const assigneeId = await fixture.addMembership(
    organizationId,
    employee.id,
    "VALET_EMPLOYEE",
  );
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  const taskId = randomUUID();
  const trackingSessionId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, $3, transaction_timestamp())`,
    [vehicleId, organizationId, liveMapSentinel],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        current_assignee_membership_id, checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4,
             $5, 'PARKING', $6, $6, transaction_timestamp())`,
    [
      sessionId,
      randomUUID(),
      organizationId,
      locationId,
      vehicleId,
      assigneeId,
    ],
  );
  await fixture.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        status, current_assignee_membership_id, updated_at)
     VALUES ($1, $2, $3, $4, 'PARKING', 'IN_PROGRESS', $5,
             transaction_timestamp())`,
    [taskId, organizationId, locationId, sessionId, assigneeId],
  );
  await fixture.query(
    `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id,
        assignee_membership_id, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, transaction_timestamp())`,
    [
      trackingSessionId,
      organizationId,
      locationId,
      sessionId,
      taskId,
      assigneeId,
    ],
  );
  await fixture.query(
    `INSERT INTO raw_gps_samples
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, client_sample_id, latitude, longitude, captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 31.5, 35.5, transaction_timestamp())`,
    [
      randomUUID(),
      organizationId,
      locationId,
      sessionId,
      taskId,
      trackingSessionId,
      randomUUID(),
    ],
  );
  const manager = await fixture.nativeLogin(managerUser);
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  return { admin, locationId, manager, membershipId, organizationId };
}

export async function revokeLiveMapGrant(
  input: Awaited<ReturnType<typeof prepareLiveMapScenario>>,
) {
  const version = await fixture.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [input.membershipId],
  );
  const response = await fixture.managementPost(
    `/v1/staff/management/organizations/${input.organizationId}/staff/` +
      `${input.membershipId}/location-access/revoke`,
    input.admin.accessToken,
    {
      expectedVersion: version.rows[0]!.version,
      locationIds: [input.locationId],
    },
  );
  expect(response.status).toBe(201);
  const persisted = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM membership_location_access
     WHERE membership_id=$1 AND location_id=$2`,
    [input.membershipId, input.locationId],
  );
  expect(persisted.rows[0]!.count).toBe("0");
}
