import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findEmergencyTakeoverAlertOccurrence,
  queryEmergencyTakeoverAlertOccurrences,
} from "../src/modules/dashboard/management-alert-sources/emergency-takeover-occurrence-reader";
import {
  findHandoffTerminalAlertOccurrence,
  queryHandoffTerminalAlertOccurrences,
} from "../src/modules/dashboard/management-alert-sources/handoff-terminal-occurrence-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext("414-custody-occurrence-sources");
beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

async function managerReader() {
  const fixture = await db.managerFixture();
  return {
    context: await db.staffSessionContext(fixture.userId),
    scope: {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      membershipId: fixture.membershipId,
    },
    limit: 21,
  };
}

async function seedHandoffAudit(
  sessionId: string,
  eventType: "HANDOFF_VERIFICATION_FAILED" | "HANDOFF_SUPERVISOR_OVERRIDE",
  metadata: object,
  daysAgo = 0,
) {
  const fixture = await db.managerFixture();
  const eventId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1,$2,$3,$4,$5,'MEMBERSHIP',$6,'ValetSession',$4,$7::jsonb,
       clock_timestamp()-($8::int * interval '1 day'))`,
    [
      eventId,
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      fixture.membershipId,
      eventType,
      JSON.stringify(metadata),
      daysAgo,
    ],
  );
  return eventId;
}

describe("Issue #414 DEC-110: committed custody sources, real PostgreSQL", () => {
  it("ALT-07 excludes ordinary/old failures, keeps separate terminal and override events, never leaks proof", async () => {
    const input = await managerReader();
    const sessionId = await db.seedSession({ state: "HANDOFF_PENDING" });
    const wrong = await seedHandoffAudit(sessionId, "HANDOFF_VERIFICATION_FAILED", {
      attempt: 1, max_attempts: 5, terminalized: false,
      pickup_code: "PRIVATE",
    });
    const terminal = await seedHandoffAudit(sessionId, "HANDOFF_VERIFICATION_FAILED", {
      attempt: 5, max_attempts: 5, terminalized: true,
      secret_hash: "PRIVATE",
    });
    const override = await seedHandoffAudit(sessionId, "HANDOFF_SUPERVISOR_OVERRIDE", {
      task_id: randomUUID(), reason: "PRIVATE reason",
    });
    const expired = await seedHandoffAudit(
      sessionId,
      "HANDOFF_VERIFICATION_FAILED",
      { attempt: 5, max_attempts: 5, terminalized: true },
      8,
    );
    const cases = await inPostgresTransaction(db.runtimePool, (tx) =>
      queryHandoffTerminalAlertOccurrences(tx, input),
    );
    expect(cases.map((entry) => entry.sourceId)).toContain(terminal);
    expect(cases.map((entry) => entry.sourceId)).toContain(override);
    for (const excluded of [wrong, expired]) {
      expect(cases.map((entry) => entry.sourceId)).not.toContain(excluded);
      expect(await inPostgresTransaction(db.runtimePool, (tx) =>
        findHandoffTerminalAlertOccurrence(tx, { ...input, sourceId: excluded }),
      )).toBeNull();
    }
    expect(JSON.stringify(cases)).not.toMatch(/PRIVATE|reason|secret_hash|pickup_code/);
    const terminalCase = cases.find((entry) => entry.sourceId === terminal);
    const overrideCase = cases.find((entry) => entry.sourceId === override);
    expect(terminalCase?.sourceKind).toBe("TERMINAL_HANDOFF_FAILURE");
    expect(overrideCase?.sourceKind).toBe("HANDOFF_SUPERVISOR_OVERRIDE");
  });

  it("ALT-05 refuses LM takeover read even with active Location grant", async () => {
    const input = await managerReader();
    await expect(inPostgresTransaction(db.runtimePool, (tx) =>
      queryEmergencyTakeoverAlertOccurrences(tx, input),
    )).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects a location without a current exact LM grant before handoff event selection", async () => {
    const input = await managerReader();
    const fixture = await db.managerFixture();
    const otherLocationId = await db.addLocation(fixture, { access: false });
    await expect(inPostgresTransaction(db.runtimePool, (tx) =>
      queryHandoffTerminalAlertOccurrences(tx, {
        ...input,
        scope: { ...input.scope, locationId: otherLocationId },
      }),
    )).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("ALT-05 admits only committed takeover receipt with exact Dispatch and Audit links for MFA-assured CA", async () => {
    const fixture = await db.managerFixture();
    const admin = await db.createActor(fixture, "ORG_ADMIN", { access: false });
    const factorId = randomUUID();
    await db.adminPool.query(
      `INSERT INTO user_mfa_totp_factors
         (id,user_id,state,protected_secret,last_accepted_step,recovery_set_generation,activated_at)
       VALUES($1,$2,'ACTIVE',$3,1,1,clock_timestamp())`,
      [factorId, admin.userId, `mte1.${"a".repeat(16)}.${"b".repeat(32)}.${"c".repeat(22)}`],
    );
    const context = await db.staffSessionContext(admin.userId);
    await db.adminPool.query(
      `UPDATE staff_auth_sessions SET mfa_factor_id=$2,
        mfa_authenticated_at=clock_timestamp(),last_admin_activity_at=clock_timestamp()
       WHERE id=$1`,
      [context.staffAuthSessionId, factorId],
    );
    const input = {
      context,
      scope: {
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        membershipId: admin.membershipId,
      },
      limit: 21,
    };
    const previous = await db.createActor(fixture, "VALET_EMPLOYEE");
    const replacement = await db.createActor(fixture, "VALET_EMPLOYEE");
    const sessionId = await db.seedSession({ state: "RETRIEVING" });
    const taskId = await db.seedTask({ sessionId, status: "IN_PROGRESS",
      taskType: "RETRIEVAL", assigneeMembershipId: previous.membershipId });
    const operationId = randomUUID();
    const dispatchId = randomUUID();
    const auditId = randomUUID();
    const operationTime = new Date();
    const actor = admin.membershipId;
    // Match the committed Issue #352 writer's exact Audit metadata shape.
    const metadata = {
      operationId,
      previousAssigneeMembershipId: previous.membershipId,
      newAssigneeMembershipId: replacement.membershipId,
      reason: "PRIVATE",
      sessionId,
      fromStatus: "IN_PROGRESS",
      toStatus: "IN_PROGRESS",
      fromVersion: 1,
      toVersion: 2,
      fromSessionVersion: 1,
      toSessionVersion: 2,
    };
    await db.adminPool.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,event_type,
          actor_membership_id,previous_assignee_membership_id,new_assignee_membership_id,
          reason,occurred_at)
       VALUES ($1,$2,$3,$4,$5,'EMERGENCY_TAKEOVER',$6,$7,$8,'PRIVATE',$9)`,
      [dispatchId, fixture.organizationId, fixture.locationId, taskId, sessionId,
        actor, previous.membershipId, replacement.membershipId, operationTime],
    );
    await db.adminPool.query(
      `INSERT INTO audit_events
         (id,organization_id,location_id,valet_session_id,actor_membership_id,
          event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'TASK_EMERGENCY_TAKEOVER','Task',$6,
          $7::jsonb,$8)`,
      [auditId, fixture.organizationId, fixture.locationId, sessionId,
        actor, taskId, JSON.stringify(metadata), operationTime],
    );
    await db.adminPool.query(
      `INSERT INTO emergency_task_takeover_operations
         (organization_id,operation_id,location_id,valet_session_id,task_id,
          actor_membership_id,previous_assignee_membership_id,new_assignee_membership_id,
          expected_task_version,result_task_version,expected_session_version,
          result_session_version,request_fingerprint,occurred_at,dispatch_event_id,audit_event_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,2,1,2,$9,$10,$11,$12)`,
      [fixture.organizationId, operationId, fixture.locationId, sessionId,
        taskId, actor, previous.membershipId, replacement.membershipId,
        "a".repeat(64), operationTime, dispatchId, auditId],
    );
    const read = (readerInput = input) => inPostgresTransaction(db.runtimePool, (tx) =>
      queryEmergencyTakeoverAlertOccurrences(tx, readerInput),
    );
    expect((await read()).map((entry) => entry.sourceId)).toContain(operationId);
    expect(await inPostgresTransaction(db.runtimePool, (tx) =>
      findEmergencyTakeoverAlertOccurrence(tx, { ...input, sourceId: operationId }),
    )).toMatchObject({ category: "ALT-05", sourceId: operationId,
      episodeId: operationId, taskId });
    // Current sensitive CA assurance is required even for historical receipt replay.
    const aged = await db.adminPool.query<{ created_at: Date }>(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '1 hour',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '2 minutes'
       WHERE id=$1 RETURNING created_at`,
      [context.staffAuthSessionId],
    );
    await expect(read({ ...input, context: {
      ...context, createdAt: aged.rows[0]!.created_at,
    } })).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
