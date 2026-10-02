import { randomUUID } from "node:crypto";
import type { DashboardApiTestContext } from "./dashboard-api-test-context";

export async function seedIssue241Overview(context: DashboardApiTestContext) {
  const fixture = await context.managerFixture();
  const staff = await context.createStaff(fixture, "VALET_EMPLOYEE");
  await context.adminPool.query(
    "UPDATE organization_memberships SET first_name='Lina', last_name='Haddad' WHERE id=$1",
    [staff.membershipId],
  );
  const keySlotId = await context.seedKeySlot("K-12");
  const sessionId = await context.seedSession({ state: "PARKED", keySlotId });
  const secondId = await context.seedSession({ state: "PARKED" });
  const checkingId = await context.seedSession({ state: "CHECKING_IN" });
  await context.seedSession({ state: "COMPLETED" });
  const zoneId = randomUUID();
  const spotId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO parking_zones (id,organization_id,location_id,code,label,status,updated_at)
      VALUES ($1,$2,$3,'Z-1','Garage','INACTIVE',clock_timestamp())`,
    [zoneId, fixture.organizationId, fixture.locationId],
  );
  await context.adminPool.query(
    `INSERT INTO parking_spots (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
      VALUES ($1,$2,$3,$4,'P-4','North','INACTIVE',clock_timestamp())`,
    [spotId, fixture.organizationId, fixture.locationId, zoneId],
  );
  await context.adminPool.query(
    `UPDATE valet_sessions SET parking_zone_id=$2,parking_spot_id=$3,current_assignee_membership_id=$4,
      created_at=clock_timestamp()-interval '1 hour' WHERE id=$1`,
    [sessionId, zoneId, spotId, fixture.membershipId],
  );
  await context.adminPool.query(
    `UPDATE vehicles SET make='Toyota',model='Camry',color='Black'
      WHERE id=(SELECT vehicle_id FROM valet_sessions WHERE id=$1)`,
    [sessionId],
  );
  const taskId = await context.seedTask({
    sessionId,
    taskType: "RETRIEVAL",
    status: "ASSIGNED",
    assigneeMembershipId: staff.membershipId,
  });
  await context.seedTask({
    sessionId: secondId,
    taskType: "PARKING",
    status: "COMPLETED",
    assigneeMembershipId: staff.membershipId,
  });
  await context.adminPool.query(
    "UPDATE valet_sessions SET current_assignee_membership_id=$2 WHERE id=$1",
    [secondId, fixture.membershipId],
  );
  await context.seedRetrievalRequest({
    sessionId,
    requestedAgoMinutes: 10,
    status: "OPEN",
  });
  await context.seedRetrievalRequest({
    sessionId: secondId,
    requestedAgoMinutes: 5,
    status: "OPEN",
  });
  const terminalRetrieval = await context.seedTask({
    sessionId: secondId,
    taskType: "RETRIEVAL",
    status: "CANCELLED",
    assigneeMembershipId: staff.membershipId,
  });
  return {
    fixture,
    staff,
    sessionId,
    secondId,
    checkingId,
    keySlotId,
    zoneId,
    spotId,
    taskId,
    terminalRetrieval,
  };
}
