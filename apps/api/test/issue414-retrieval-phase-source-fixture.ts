import { randomUUID } from "node:crypto";

import type { RetrievalPhaseAlertInput } from "../src/modules/dashboard/management-alert-sources/retrieval-phase-alert-types";
import type { DashboardActor } from "./dashboard-test-context";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const staffByDatabase = new WeakMap<
  DashboardOverviewTestContext,
  Promise<DashboardActor>
>();
const originalCutover =
  process.env.MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER;

/**
 * Simulated post-quiescence stage epoch in an isolated disposable PG fixture.
 * This does NOT capture, attest or replace the required production quiescence
 * and server-clock release evidence; the seeded stages are deliberately
 * historical so their personalized 60-second delay can be exercised.
 */
export function setTrustedPhaseTestCutover(value: Date): void {
  process.env.MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER =
    value.toISOString();
}

export function restoreTrustedPhaseTestCutover(): void {
  if (originalCutover === undefined) {
    delete process.env.MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER;
  } else {
    process.env.MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER =
      originalCutover;
  }
}

async function sourceStaff(db: DashboardOverviewTestContext) {
  const existing = staffByDatabase.get(db);
  if (existing !== undefined) return existing;
  const staff = (async () => {
    const fixture = await db.managerFixture();
    const actor = await db.createActor(fixture, "VALET_EMPLOYEE");
    await db.startActiveShift(fixture, actor);
    return actor;
  })();
  staffByDatabase.set(db, staff);
  return staff;
}

export async function phaseReaderInput(
  db: DashboardOverviewTestContext,
  graceSeconds = 0,
): Promise<RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number }> {
  const fixture = await db.managerFixture();
  const context = await db.staffSessionContext(fixture.userId);
  const cutoff = await db.adminPool.query<{ cutoff: Date }>(
    "SELECT (clock_timestamp() - interval '2 hours')::timestamptz(3) AS cutoff",
  );
  const trustedCutover = cutoff.rows[0]!.cutoff;
  setTrustedPhaseTestCutover(trustedCutover);
  return {
    context,
    scope: {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      membershipId: fixture.membershipId,
    },
    delaySeconds: 60,
    alt01GraceSeconds: graceSeconds,
    postLockClockCutover: trustedCutover,
    limit: 21,
  };
}

/** A deliberately committed stage history; all timestamps are PostgreSQL-authored. */
export async function seedPhaseStage(
  db: DashboardOverviewTestContext,
  status: "ACCEPTED" | "IN_PROGRESS",
  fixedSourceTime?: Date,
  slaSnapshotSeconds?: number,
) {
  const fixture = await db.managerFixture();
  const actor = await sourceStaff(db);
  const sessionId = await db.seedSession({
    state: status === "ACCEPTED" ? "REQUESTED" : "RETRIEVING",
  });
  const taskId = await db.seedTask({
    sessionId,
    status,
    taskType: "RETRIEVAL",
    assigneeMembershipId: actor.membershipId,
  });
  // BEFORE INSERT trigger snapshots the owning Location's SLA regardless of
  // supplied retrieval_requests columns. Configure the source policy first.
  const oldSla =
    slaSnapshotSeconds === undefined
      ? undefined
      : (
          await db.adminPool.query<{ sla_target_seconds: number | null }>(
            `SELECT sla_target_seconds FROM locations
             WHERE organization_id=$1 AND id=$2`,
            [fixture.organizationId, fixture.locationId],
          )
        ).rows[0]!.sla_target_seconds;
  if (slaSnapshotSeconds !== undefined) {
    await db.adminPool.query(
      `UPDATE locations SET sla_target_seconds=$3
       WHERE organization_id=$1 AND id=$2`,
      [fixture.organizationId, fixture.locationId, slaSnapshotSeconds],
    );
  }
  let requestId: string;
  try {
    requestId = await db.seedRetrievalRequest({
      sessionId,
      status: status === "ACCEPTED" ? "OPEN" : "ACCEPTED",
      requestedAgoMinutes: 12,
    });
    if (slaSnapshotSeconds !== undefined) {
      const snapshot = await db.adminPool.query<{
        sla_target_seconds_snapshot: number | null;
      }>(
        `SELECT sla_target_seconds_snapshot FROM retrieval_requests WHERE id=$1`,
        [requestId],
      );
      if (
        snapshot.rows[0]?.sla_target_seconds_snapshot !== slaSnapshotSeconds
      ) {
        throw new Error(
          "Source fixture did not persist the canonical SLA snapshot",
        );
      }
    }
  } finally {
    if (slaSnapshotSeconds !== undefined) {
      await db.adminPool.query(
        `UPDATE locations SET sla_target_seconds=$3
         WHERE organization_id=$1 AND id=$2`,
        [fixture.organizationId, fixture.locationId, oldSla],
      );
    }
  }
  const at =
    fixedSourceTime ??
    (
      await db.adminPool.query<{ at: Date }>(
        "SELECT (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS at",
      )
    ).rows[0]!.at;
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
  const metadata =
    status === "ACCEPTED"
      ? {
          fromStatus: "ASSIGNED",
          toStatus: "ACCEPTED",
          fromVersion: 2,
          toVersion: taskVersion,
          sessionId,
        }
      : {
          fromTaskStatus: "ACCEPTED",
          toTaskStatus: "IN_PROGRESS",
          fromTaskVersion: 3,
          toTaskVersion: taskVersion,
          fromSessionState: "REQUESTED",
          toSessionState: "RETRIEVING",
          taskId,
        };
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      randomUUID(),
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      actor.membershipId,
      status === "ACCEPTED"
        ? "TASK_ACCEPTED"
        : "VALET_SESSION_RETRIEVAL_STARTED",
      status === "ACCEPTED" ? "Task" : "VALET_SESSION",
      status === "ACCEPTED" ? taskId : sessionId,
      JSON.stringify(metadata),
      at,
    ],
  );
  const dispatchId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,
        event_type,actor_membership_id,new_assignee_membership_id,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)`,
    [
      dispatchId,
      fixture.organizationId,
      fixture.locationId,
      taskId,
      sessionId,
      status,
      actor.membershipId,
      at,
    ],
  );
  return {
    at,
    actorMembershipId: actor.membershipId,
    dispatchId,
    requestId,
    sessionId,
    taskId,
  };
}

export async function seedPhaseReady(
  db: DashboardOverviewTestContext,
  options: { readonly malformedAuditVersion?: boolean } = {},
) {
  const fixture = await db.managerFixture();
  const actor = await sourceStaff(db);
  const sessionId = await db.seedSession({ state: "READY" });
  const taskId = await db.seedTask({
    sessionId,
    status: "IN_PROGRESS",
    taskType: "RETRIEVAL",
    assigneeMembershipId: actor.membershipId,
  });
  const requestId = await db.seedRetrievalRequest({
    sessionId,
    status: "ACCEPTED",
    requestedAgoMinutes: 12,
  });
  const at = (
    await db.adminPool.query<{ at: Date }>(
      "SELECT (clock_timestamp()-interval '120 seconds')::timestamptz(3) AS at",
    )
  ).rows[0]!.at;
  await db.adminPool.query(
    `UPDATE valet_sessions
     SET retrieval_requested_at=(SELECT requested_at FROM retrieval_requests WHERE id=$2),
         retrieval_started_at=$3::timestamptz - interval '10 minutes',ready_at=$3
     WHERE id=$1`,
    [sessionId, requestId, at],
  );
  const auditId = randomUUID();
  const normalAuditMetadata = JSON.stringify({
    fromState: "RETRIEVING",
    toState: "READY",
    fromVersion: 6,
    toVersion: 7,
    taskId,
  });
  // Only the initial INSERT is allowed. Issue #300 DB triggers forbid any
  // audit metadata UPDATE, including test-only rewrites.
  const auditMetadata =
    options.malformedAuditVersion === true
      ? normalAuditMetadata.replace(
          '"toVersion":7',
          '"toVersion":999999999999999999999999999999999999999999999999',
        )
      : normalAuditMetadata;
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,
        actor_membership_id,event_type,entity_type,entity_id,
        metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,$5,'VALET_SESSION_READY','VALET_SESSION',$4,$6::jsonb,$7)`,
    [
      auditId,
      fixture.organizationId,
      fixture.locationId,
      sessionId,
      actor.membershipId,
      auditMetadata,
      at,
    ],
  );
  return {
    at,
    actorMembershipId: actor.membershipId,
    auditId,
    sessionId,
    taskId,
  };
}
