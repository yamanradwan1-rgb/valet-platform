import { randomUUID } from "node:crypto";

import type { RetrievalPhaseAlertInput } from "../src/modules/dashboard/management-alert-sources/retrieval-phase-alert-types";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

export async function phaseReaderInput(
  db: DashboardOverviewTestContext,
  graceSeconds = 0,
): Promise<RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number }> {
  const fixture = await db.managerFixture();
  const context = await db.staffSessionContext(fixture.userId);
  const cutoff = await db.adminPool.query<{ cutoff: Date }>(
    "SELECT (clock_timestamp() - interval '2 hours')::timestamptz(3) AS cutoff",
  );
  return {
    context,
    scope: {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      membershipId: fixture.membershipId,
    },
    delaySeconds: 60,
    alt01GraceSeconds: graceSeconds,
    postLockClockCutover: cutoff.rows[0]!.cutoff,
    limit: 21,
  };
}

/** A deliberately committed stage history; all timestamps are PostgreSQL-authored. */
export async function seedPhaseStage(
  db: DashboardOverviewTestContext,
  status: "ACCEPTED" | "IN_PROGRESS",
  fixedSourceTime?: Date,
) {
  const fixture = await db.managerFixture();
  const sessionId = await db.seedSession({
    state: status === "ACCEPTED" ? "REQUESTED" : "RETRIEVING",
  });
  const taskId = await db.seedTask({
    sessionId,
    status,
    taskType: "RETRIEVAL",
    assigneeMembershipId: fixture.membershipId,
  });
  const requestId = await db.seedRetrievalRequest({
    sessionId,
    status: status === "ACCEPTED" ? "OPEN" : "ACCEPTED",
    requestedAgoMinutes: 12,
  });
  const at = fixedSourceTime ?? (await db.adminPool.query<{ at: Date }>(
    "SELECT (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS at",
  )).rows[0]!.at;
  const taskVersion = status === "ACCEPTED" ? 3 : 4;
  await db.adminPool.query(
    `UPDATE tasks SET version=$2,updated_at=$3 WHERE id=$1`,
    [taskId, taskVersion, at],
  );
  await db.adminPool.query(
    `UPDATE valet_sessions
     SET retrieval_requested_at=(SELECT requested_at FROM retrieval_requests WHERE id=$2),
         retrieval_started_at=$3
     WHERE id=$1`,
    [sessionId, requestId, status === "IN_PROGRESS" ? at : null],
  );
  const metadata = status === "ACCEPTED"
    ? { fromStatus: "ASSIGNED", toStatus: "ACCEPTED",
        fromVersion: 2, toVersion: taskVersion, sessionId }
    : { fromTaskStatus: "ACCEPTED", toTaskStatus: "IN_PROGRESS",
        fromTaskVersion: 3, toTaskVersion: taskVersion,
        fromSessionState: "REQUESTED", toSessionState: "RETRIEVING", taskId };
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [randomUUID(), fixture.organizationId, fixture.locationId, sessionId,
      fixture.membershipId,
      status === "ACCEPTED" ? "TASK_ACCEPTED" : "VALET_SESSION_RETRIEVAL_STARTED",
      status === "ACCEPTED" ? "Task" : "VALET_SESSION",
      status === "ACCEPTED" ? taskId : sessionId,
      JSON.stringify(metadata), at],
  );
  const dispatchId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)`,
    [dispatchId, fixture.organizationId, fixture.locationId, taskId,
      sessionId, status, fixture.membershipId, at],
  );
  return { at, dispatchId, requestId, sessionId, taskId };
}

export async function seedPhaseReady(db: DashboardOverviewTestContext) {
  const fixture = await db.managerFixture();
  const sessionId = await db.seedSession({ state: "READY" });
  const taskId = await db.seedTask({
    sessionId, status: "IN_PROGRESS", taskType: "RETRIEVAL",
    assigneeMembershipId: fixture.membershipId,
  });
  const requestId = await db.seedRetrievalRequest({
    sessionId, status: "ACCEPTED", requestedAgoMinutes: 12,
  });
  const at = (await db.adminPool.query<{ at: Date }>(
    "SELECT (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS at",
  )).rows[0]!.at;
  await db.adminPool.query(
    `UPDATE valet_sessions
     SET retrieval_requested_at=(SELECT requested_at FROM retrieval_requests WHERE id=$2),
         retrieval_started_at=$3 - interval '10 minutes',ready_at=$3
     WHERE id=$1`,
    [sessionId, requestId, at],
  );
  const auditId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,
        actor_membership_id,event_type,entity_type,entity_id,
        metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,$5,'VALET_SESSION_READY','VALET_SESSION',$4,$6::jsonb,$7)`,
    [auditId, fixture.organizationId, fixture.locationId, sessionId,
      fixture.membershipId,
      JSON.stringify({ fromState: "RETRIEVING", toState: "READY",
        fromVersion: 6, toVersion: 7, taskId }), at],
  );
  return { at, auditId, sessionId, taskId };
}
