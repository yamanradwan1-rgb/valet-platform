import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

export interface TaskTrackingScope {
  readonly locationId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly taskId: string;
}

export interface TaskTrackingStartScope extends TaskTrackingScope {
  readonly assigneeMembershipId: string;
}

type IntegrityConflict = () => never;

async function effectiveTrackingEnabled(
  transaction: PostgresTransaction,
  scope: TaskTrackingScope,
  integrityConflict: IntegrityConflict,
): Promise<boolean> {
  const result = await transaction.query<{ tracking_enabled: boolean }>(
    `SELECT COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS tracking_enabled
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.organization_id = $1 AND location.id = $2`,
    [scope.organizationId, scope.locationId],
  );
  const policy = result.rows[0]?.tracking_enabled;
  if (policy === undefined) integrityConflict();
  return policy;
}

export async function startTaskTrackingIfEnabled(
  transaction: PostgresTransaction,
  scope: TaskTrackingStartScope,
  operationTime: Date,
  integrityConflict: IntegrityConflict,
): Promise<void> {
  const active = await transaction.query(
    `SELECT id FROM task_tracking_sessions
     WHERE valet_session_id = $1 AND ended_at IS NULL
     FOR UPDATE`,
    [scope.sessionId],
  );
  if (active.rows[0] !== undefined) {
    integrityConflict();
  }

  if (
    !(await effectiveTrackingEnabled(transaction, scope, integrityConflict))
  ) {
    return;
  }

  try {
    await transaction.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id,
          assignee_membership_id, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        scope.organizationId,
        scope.locationId,
        scope.sessionId,
        scope.taskId,
        scope.assigneeMembershipId,
        operationTime,
      ],
    );
  } catch (error) {
    const postgres = error as { code?: unknown };
    if (postgres.code === "23505") {
      integrityConflict();
    }
    throw error;
  }
}

export async function stopTaskTrackingForMovement(
  transaction: PostgresTransaction,
  scope: TaskTrackingScope,
  operationTime: Date,
  integrityConflict: IntegrityConflict,
): Promise<void> {
  const result = await transaction.query<{ id: string; task_id: string }>(
    `SELECT id::text, task_id::text
     FROM task_tracking_sessions
     WHERE valet_session_id = $1 AND ended_at IS NULL
     FOR UPDATE`,
    [scope.sessionId],
  );
  const active = result.rows[0];
  if (active === undefined) return;
  if (active.task_id !== scope.taskId) {
    integrityConflict();
  }

  const ended = await transaction.query(
    `UPDATE task_tracking_sessions SET ended_at = $2
     WHERE id = $1 AND ended_at IS NULL`,
    [active.id, operationTime],
  );
  if (ended.rowCount !== 1) {
    integrityConflict();
  }
}
