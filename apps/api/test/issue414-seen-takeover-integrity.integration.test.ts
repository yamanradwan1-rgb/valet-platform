import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { markManagementAlertOccurrenceSeen } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-command";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext("414-seen-takeover-identity");
let organizationId: string;
let locationId: string;
let actorMembershipId: string;
let previousMembershipId: string;
let newMembershipId: string;
let mismatchedMembershipId: string;
let valetSessionId: string;
let taskId: string;
let context: Awaited<ReturnType<typeof db.staffSessionContext>>;

beforeAll(async () => {
  await db.setup();
  const scope = await db.managerFixture();
  organizationId = scope.organizationId;
  locationId = scope.locationId;
  const admin = await db.createActor(scope, "ORG_ADMIN", { access: false });
  actorMembershipId = admin.membershipId;
  const factorId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO user_mfa_totp_factors
       (id,user_id,state,protected_secret,last_accepted_step,
        recovery_set_generation,activated_at)
     VALUES($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
    [factorId, admin.userId,
      `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`],
  );
  context = await db.staffSessionContext(admin.userId);
  await db.adminPool.query(
    `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
       mfa_authenticated_at=clock_timestamp(),
       last_admin_activity_at=clock_timestamp() WHERE id=$1`,
    [context.staffAuthSessionId, factorId],
  );
  previousMembershipId = (await db.createActor(scope, "VALET_EMPLOYEE")).membershipId;
  newMembershipId = (await db.createActor(scope, "VALET_EMPLOYEE")).membershipId;
  mismatchedMembershipId = (await db.createActor(scope, "VALET_EMPLOYEE")).membershipId;
  valetSessionId = await db.seedSession({ state: "RETRIEVING" });
  taskId = await db.seedTask({ sessionId: valetSessionId,
    status: "IN_PROGRESS", taskType: "RETRIEVAL",
    assigneeMembershipId: previousMembershipId,
  });
}, 120_000);
afterAll(() => db.teardown(), 120_000);

type Mutation =
  | "NONE" | "AUDIT_OPERATION" | "AUDIT_ASSIGNEE" | "AUDIT_VERSION"
  | "AUDIT_STATUS" | "DISPATCH_ACTOR" | "DISPATCH_ASSIGNEE";

async function seedCommittedTakeover(mutation: Mutation) {
  const operationId = randomUUID();
  const dispatchId = randomUUID();
  const auditId = randomUUID();
  const occurredAt = new Date();
  const reason = "Operational re-assignment";
  await db.adminPool.query(
    `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,event_type,
        actor_membership_id,previous_assignee_membership_id,
        new_assignee_membership_id,reason,occurred_at)
     VALUES($1,$2,$3,$4,$5,'EMERGENCY_TAKEOVER',$6,$7,$8,$9,$10)`,
    [dispatchId, organizationId, locationId, taskId, valetSessionId,
      mutation === "DISPATCH_ACTOR" ? newMembershipId : actorMembershipId,
      previousMembershipId,
      mutation === "DISPATCH_ASSIGNEE" ? mismatchedMembershipId : newMembershipId,
      reason, occurredAt],
  );
  const metadata = {
    operationId: mutation === "AUDIT_OPERATION" ? randomUUID() : operationId,
    previousAssigneeMembershipId: previousMembershipId,
    newAssigneeMembershipId: mutation === "AUDIT_ASSIGNEE"
      ? previousMembershipId : newMembershipId,
    reason,
    sessionId: valetSessionId,
    fromStatus: mutation === "AUDIT_STATUS" ? "QUEUED" : "IN_PROGRESS",
    toStatus: "IN_PROGRESS",
    fromVersion: 1,
    toVersion: mutation === "AUDIT_VERSION" ? 9 : 2,
    fromSessionVersion: 1,
    toSessionVersion: 2,
  };
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,
        actor_membership_id,event_type,entity_type,entity_id,metadata_json,occurred_at)
     VALUES ($1,$2,$3,$4,$5,'TASK_EMERGENCY_TAKEOVER','Task',$6,$7::jsonb,$8)`,
    [auditId, organizationId, locationId, valetSessionId,
      actorMembershipId, taskId, JSON.stringify(metadata), occurredAt],
  );
  await db.adminPool.query(
    `INSERT INTO emergency_task_takeover_operations
       (organization_id,operation_id,location_id,valet_session_id,task_id,
        actor_membership_id,previous_assignee_membership_id,new_assignee_membership_id,
        expected_task_version,result_task_version,expected_session_version,
        result_session_version,request_fingerprint,occurred_at,dispatch_event_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,2,1,2,$9,$10,$11,$12)`,
    [organizationId, operationId, locationId, valetSessionId,
      taskId, actorMembershipId, previousMembershipId, newMembershipId,
      "a".repeat(64), occurredAt, dispatchId, auditId],
  );
  return operationId;
}

describe("Issue #414 W21 ALT-05 Seen source integrity (real PG17)", () => {
  it("accepts proven takeover, denies committed but mismatched actors/owners/metadata", async () => {
    const valid = await seedCommittedTakeover("NONE");
    const mark = (operationId: string) => markManagementAlertOccurrenceSeen(db.runtimePool, {
      context, locationId, category: "ALT-05",
      sourceId: operationId, episodeId: operationId,
    });
    expect((await mark(valid)).episodeId).toBe(valid);
    expect(await mark(valid)).toMatchObject({ episodeId: valid });
    for (const mutation of [
      "AUDIT_OPERATION", "AUDIT_ASSIGNEE", "AUDIT_VERSION", "AUDIT_STATUS",
      "DISPATCH_ACTOR", "DISPATCH_ASSIGNEE",
    ] as const) {
      const invalid = await seedCommittedTakeover(mutation);
      await expect(mark(invalid)).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
    const count = await db.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM management_alert_seen_receipts
       WHERE organization_id=$1 AND user_id=$2 AND category='ALT-05'`,
      [organizationId, context.userId],
    );
    expect(count.rows[0]?.count).toBe(1);
  });
});
