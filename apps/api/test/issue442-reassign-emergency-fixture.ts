import type { EmergencyTakeoverCommandRequest } from "../src/modules/dispatch/emergency-takeover-types";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

export function makeIssue442ReassignContext(label: string) {
  return new Issue352TakeoverTestContext(
    `issue442_reassign_emergency_${label}`,
  );
}

export type RaceContext = Issue352TakeoverTestContext;
export type ReassignRequest = Parameters<
  ReturnType<
    typeof import("../src/modules/dispatch/reassign-task-command").createReassignTaskCommandExecutor
  >
>[0];

export interface ReassignEmergencyCase {
  readonly taskId: string;
  readonly sessionId: string;
  readonly originalMembershipId: string;
  readonly replacementMembershipId: string;
  readonly replacementUserId: string;
  readonly supervisorUserId: string;
  readonly reassign: ReassignRequest;
  readonly emergency: EmergencyTakeoverCommandRequest;
}

/** An ASSIGNED Parking Task: Reassign is legal; Emergency is intrinsically invalid. */
export async function assignedCase(
  context: RaceContext,
): Promise<ReassignEmergencyCase> {
  const source = await context.createStartParkingFixture({ acceptTask: false });
  const { initiator, replacement } = await context.actors(source);
  const before = await context.snapshot(source.taskId);
  if (before.task_status !== "ASSIGNED") {
    throw new Error("Expected an ASSIGNED Task for the real Reassign writer.");
  }
  return {
    taskId: source.taskId,
    sessionId: source.sessionId,
    originalMembershipId: before.task_assignee!,
    replacementMembershipId: replacement.membershipId,
    replacementUserId: replacement.userId,
    supervisorUserId: initiator.userId,
    reassign: {
      authenticatedUserId: initiator.userId,
      expectedVersion: before.task_version,
      reason: "Issue442 Task-first Reassign FK regression",
      targetAssigneeMembershipId: replacement.membershipId,
      taskId: source.taskId,
    },
    emergency: await context.request(
      source,
      initiator,
      replacement,
      "Stale Emergency cannot take an ASSIGNED Task",
    ),
  };
}

/** The complementary legal Emergency case, with an in-progress Parking Task. */
export async function inProgressCase(
  context: RaceContext,
): Promise<ReassignEmergencyCase> {
  const source = await context.parking();
  const { initiator, replacement } = await context.actors(source);
  const before = await context.snapshot(source.taskId);
  if (before.task_status !== "IN_PROGRESS") {
    throw new Error("Expected IN_PROGRESS Task for real Emergency Takeover.");
  }
  return {
    taskId: source.taskId,
    sessionId: source.sessionId,
    originalMembershipId: before.task_assignee!,
    replacementMembershipId: replacement.membershipId,
    replacementUserId: replacement.userId,
    supervisorUserId: initiator.userId,
    reassign: {
      authenticatedUserId: initiator.userId,
      expectedVersion: before.task_version,
      reason: "Issue442 Reassign cannot change in-progress Task",
      targetAssigneeMembershipId: replacement.membershipId,
      taskId: source.taskId,
    },
    emergency: await context.request(source, initiator, replacement),
  };
}

export async function evidence(context: RaceContext, taskId: string) {
  const result = await context.adminPool.query<{
    reassign_audits: number;
    reassign_dispatch: number;
    emergency_audits: number;
    emergency_dispatch: number;
    receipts: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM audit_events WHERE entity_type='Task'
          AND entity_id=$1 AND event_type='TASK_REASSIGNED') AS reassign_audits,
       (SELECT count(*)::int FROM dispatch_events WHERE task_id=$1
          AND event_type='REASSIGNED') AS reassign_dispatch,
       (SELECT count(*)::int FROM audit_events WHERE entity_type='Task'
          AND entity_id=$1 AND event_type='TASK_EMERGENCY_TAKEOVER') AS emergency_audits,
       (SELECT count(*)::int FROM dispatch_events WHERE task_id=$1
          AND event_type='EMERGENCY_TAKEOVER') AS emergency_dispatch,
       (SELECT count(*)::int FROM emergency_task_takeover_operations
          WHERE task_id=$1) AS receipts`,
    [taskId],
  );
  return result.rows[0]!;
}
