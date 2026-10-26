import { randomUUID } from "node:crypto";
import type { ManagementAuditTestFixture } from "./management-audit-test-fixture";
import {
  seedCompanyPayment,
  seedCompanySession,
} from "./management-company-analytics-test-seed";

/** Nonempty synthetic custody, dispatch and financial history for the Resume invariant. */
export async function seedResumeOperationalRecords(
  fixture: ManagementAuditTestFixture,
  input: {
    organizationId: string;
    locationId: string;
    employeeMembershipId: string;
  },
) {
  const scope = { ...input, membershipId: input.employeeMembershipId };
  const sessionId = await seedCompanySession(fixture, scope, {
    state: "REQUESTED",
    createdAt: "2026-10-01T05:00:00Z",
    checkingInCompletedAt: "2026-10-01T05:02:00Z",
    parkedAt: "2026-10-01T05:05:00Z",
    retrievalRequestedAt: "2026-10-01T06:00:00Z",
  });
  await seedCompanyPayment(fixture, scope, {
    sessionId,
    currency: "JOD",
    status: "PAID",
    paidAt: "2026-10-01T05:02:00Z",
  });
  const taskId = randomUUID(),
    slotId = randomUUID();
  await fixture.query(
    `INSERT INTO tasks
    (id,organization_id,location_id,valet_session_id,task_type,status,current_assignee_membership_id,updated_at)
    VALUES($1,$2,$3,$4,'RETRIEVAL','ASSIGNED',$5,clock_timestamp())`,
    [
      taskId,
      scope.organizationId,
      scope.locationId,
      sessionId,
      scope.membershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO dispatch_events
    (id,organization_id,location_id,task_id,valet_session_id,event_type,actor_membership_id,new_assignee_membership_id)
    VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$6)`,
    [
      randomUUID(),
      scope.organizationId,
      scope.locationId,
      taskId,
      sessionId,
      scope.membershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
    VALUES($1,$2,$3,$4,clock_timestamp())`,
    [slotId, scope.organizationId, scope.locationId, randomUUID()],
  );
  await fixture.query("UPDATE valet_sessions SET key_slot_id=$2 WHERE id=$1", [
    sessionId,
    slotId,
  ]);
  await fixture.query(
    `INSERT INTO key_custody_events
    (id,organization_id,location_id,valet_session_id,key_slot_id,actor_membership_id,event_type)
    VALUES($1,$2,$3,$4,$5,$6,'SLOT_ASSIGNED')`,
    [
      randomUUID(),
      scope.organizationId,
      scope.locationId,
      sessionId,
      slotId,
      scope.membershipId,
    ],
  );
}
