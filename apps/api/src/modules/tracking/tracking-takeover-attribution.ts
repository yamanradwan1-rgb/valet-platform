import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

export interface EmergencyTrackingTransitionScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly fromAssigneeMembershipId: string;
  readonly toAssigneeMembershipId: string;
  readonly movementActive: boolean;
  /** clock_timestamp(), sampled AFTER the Session/Task/Tracker locks. */
  readonly operationTime: Date;
}

interface ExistingTracker {
  readonly id: string;
  readonly task_id: string;
  readonly assignee_membership_id: string | null;
}

type IntegrityConflict = () => never;

export interface EmergencyTrackingTransitionResult {
  readonly endedTrackingSessionId: string | null;
  readonly startedTrackingSessionId: string | null;
}

/**
 * Session-first locking is the orchestrator's responsibility. Never
 * relabel A's historical samples or a legacy segment with unknown owner.
 */
export async function transitionTaskTrackingForEmergencyTakeover(
  transaction: PostgresTransaction,
  scope: EmergencyTrackingTransitionScope,
  integrityConflict: IntegrityConflict,
): Promise<EmergencyTrackingTransitionResult> {
  const active = await transaction.query<ExistingTracker>(
    `SELECT id::text, task_id::text, assignee_membership_id::text
     FROM task_tracking_sessions
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND ended_at IS NULL
     FOR UPDATE`,
    [scope.organizationId, scope.locationId, scope.sessionId],
  );
  if (active.rows.length > 1) integrityConflict();
  const old = active.rows[0];
  if (
    old !== undefined &&
    (old.task_id !== scope.taskId ||
      old.assignee_membership_id === null ||
      old.assignee_membership_id !== scope.fromAssigneeMembershipId)
  ) {
    integrityConflict();
  }
  if (old !== undefined && !scope.movementActive) {
    integrityConflict();
  }
  if (old !== undefined) {
    const closed = await transaction.query(
      `UPDATE task_tracking_sessions SET ended_at = $2
       WHERE id = $1 AND ended_at IS NULL`,
      [old.id, scope.operationTime],
    );
    if (closed.rowCount !== 1) integrityConflict();
  }

  const policy = await transaction.query<{ tracking_enabled: boolean }>(
    `SELECT COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS tracking_enabled
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.organization_id = $1 AND location.id = $2`,
    [scope.organizationId, scope.locationId],
  );
  if (policy.rows[0]?.tracking_enabled === undefined) integrityConflict();
  if (!scope.movementActive || policy.rows[0]?.tracking_enabled !== true) {
    return {
      endedTrackingSessionId: old?.id ?? null,
      startedTrackingSessionId: null,
    };
  }

  const newId = randomUUID();
  try {
    await transaction.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id,
          assignee_membership_id, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId,
        scope.organizationId,
        scope.locationId,
        scope.sessionId,
        scope.taskId,
        scope.toAssigneeMembershipId,
        scope.operationTime,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === "23505") integrityConflict();
    throw error;
  }
  return {
    endedTrackingSessionId: old?.id ?? null,
    startedTrackingSessionId: newId,
  };
}
