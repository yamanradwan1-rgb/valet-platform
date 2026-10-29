import { createHash } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  EmergencyTakeoverCommandRequest,
  EmergencyTakeoverCommandResult,
  EmergencyTakeoverReceipt,
  EmergencyTrackingTransition,
  LockedEmergencySession,
  LockedEmergencyTask,
} from "./emergency-takeover-types";

export class EmergencyTakeoverConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super(
      "The operation identity has already been used for a different request.",
    );
    this.name = "EmergencyTakeoverConflictError";
  }
}

export function fingerprintEmergencyIntent(
  request: EmergencyTakeoverCommandRequest,
  actorMembershipId: string,
  session: LockedEmergencySession,
  reason: string,
): string {
  // All fields are ordered, typed and stable across retries, including after state changes.
  const intent = [
    session.organization_id,
    session.location_id,
    session.id,
    request.taskId,
    actorMembershipId,
    request.targetAssigneeMembershipId,
    request.expectedVersion,
    reason,
  ];
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

/** Session is already locked; serialize this logical key even across different Tasks. */
export async function lockEmergencyOperationIdentity(
  tx: PostgresTransaction,
  organizationId: string,
  operationId: string,
): Promise<void> {
  await tx.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('emergency-takeover:' || $1::text || ':' || $2::text,0))`,
    [organizationId, operationId],
  );
}

export async function findEmergencyReceipt(
  tx: PostgresTransaction,
  organizationId: string,
  operationId: string,
): Promise<EmergencyTakeoverReceipt | undefined> {
  const result = await tx.query<EmergencyTakeoverReceipt>(
    `SELECT organization_id::text, operation_id::text, task_id::text,
            actor_membership_id::text, previous_assignee_membership_id::text,
            new_assignee_membership_id::text, expected_task_version,
            result_task_version, expected_session_version,
            result_session_version, request_fingerprint
     FROM emergency_task_takeover_operations
     WHERE organization_id=$1 AND operation_id=$2`,
    [organizationId, operationId],
  );
  return result.rows[0];
}

export function replayEmergencyReceipt(
  receipt: EmergencyTakeoverReceipt,
  fingerprint: string,
): EmergencyTakeoverCommandResult {
  if (receipt.request_fingerprint !== fingerprint) {
    throw new EmergencyTakeoverConflictError();
  }
  return {
    operationId: receipt.operation_id,
    replayed: true,
    task: {
      id: receipt.task_id,
      status: "IN_PROGRESS",
      version: receipt.result_task_version,
      assigneeMembershipId: receipt.new_assignee_membership_id,
    },
    sessionVersion: receipt.result_session_version,
  };
}

export async function insertEmergencyReceipt(
  tx: PostgresTransaction,
  input: {
    readonly request: EmergencyTakeoverCommandRequest;
    readonly session: LockedEmergencySession;
    readonly task: LockedEmergencyTask;
    readonly actorMembershipId: string;
    readonly fingerprint: string;
    readonly operationTime: Date;
    readonly dispatchEventId: string;
    readonly auditEventId: string;
    readonly tracking: EmergencyTrackingTransition;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO emergency_task_takeover_operations
       (organization_id,operation_id,location_id,valet_session_id,task_id,
        actor_membership_id,previous_assignee_membership_id,new_assignee_membership_id,
        expected_task_version,result_task_version,expected_session_version,
        result_session_version,request_fingerprint,occurred_at,dispatch_event_id,
        audit_event_id,ended_old_tracking_session_id,new_tracking_session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      input.session.organization_id,
      input.request.operationId,
      input.session.location_id,
      input.session.id,
      input.task.id,
      input.actorMembershipId,
      input.task.current_assignee_membership_id,
      input.request.targetAssigneeMembershipId,
      input.task.version,
      input.task.version + 1,
      input.session.version,
      input.session.version + 1,
      input.fingerprint,
      input.operationTime,
      input.dispatchEventId,
      input.auditEventId,
      input.tracking.endedOldTrackingSessionId,
      input.tracking.newTrackingSessionId,
    ],
  );
}
