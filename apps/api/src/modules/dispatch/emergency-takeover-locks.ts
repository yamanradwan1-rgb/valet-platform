import type { PostgresTransaction } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { DispatchOperationError } from "./dispatch-errors";
import type { LockedTaskRow } from "./dispatch-types";
import type {
  LockedEmergencySession,
  LockedEmergencyTask,
} from "./emergency-takeover-types";

/** This first read supplies only a lock-order hint; none of its data authorizes a write. */
export async function hintEmergencyTaskSession(
  tx: PostgresTransaction,
  taskId: string,
): Promise<string> {
  const lookup = await tx.query<{ valet_session_id: string }>(
    `SELECT valet_session_id::text FROM tasks WHERE id=$1`,
    [taskId],
  );
  const sessionId = lookup.rows[0]?.valet_session_id;
  if (sessionId === undefined) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return sessionId;
}

export async function lockEmergencySession(
  tx: PostgresTransaction,
  sessionId: string,
): Promise<LockedEmergencySession> {
  const result = await tx.query<LockedEmergencySession>(
    `SELECT id::text, organization_id::text, location_id::text,
            state::text, version
     FROM valet_sessions WHERE id=$1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  await lockManagementSettingsOrganization(
    tx,
    session.organization_id,
    "SHARED",
  );
  return session;
}

/** Revalidate every scope field under the Task lock after its Session lock. */
export async function lockEmergencyTask(
  tx: PostgresTransaction,
  taskId: string,
  session: LockedEmergencySession,
): Promise<LockedTaskRow> {
  const result = await tx.query<LockedTaskRow>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, task_type::text, status::text,
            current_assignee_membership_id::text, version, created_at, updated_at
     FROM tasks WHERE id=$1 AND organization_id=$2 AND location_id=$3
       AND valet_session_id=$4 FOR UPDATE`,
    [taskId, session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (
    task === undefined ||
    !["PARKING", "RETRIEVAL"].includes(task.task_type)
  ) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export function requireEmergencyInProgress(
  task: LockedTaskRow,
): asserts task is LockedEmergencyTask {
  if (
    task.status !== "IN_PROGRESS" ||
    task.current_assignee_membership_id === null
  ) {
    throw new DispatchOperationError("TASK_INVALID_STATE");
  }
}

/** Fence A's last GPS writer before obtaining the authoritative takeover time. */
export async function lockEmergencyTrackingFrontier(
  tx: PostgresTransaction,
  session: LockedEmergencySession,
): Promise<void> {
  await tx.query(
    `SELECT id FROM task_tracking_sessions
     WHERE organization_id=$1 AND location_id=$2
       AND valet_session_id=$3 AND ended_at IS NULL
     FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
}

export async function lockEmergencyRetrievalRequestStatus(
  tx: PostgresTransaction,
  session: LockedEmergencySession,
): Promise<string | null> {
  const result = await tx.query<{ status: string }>(
    `SELECT status::text FROM retrieval_requests
     WHERE organization_id=$1 AND valet_session_id=$2
       AND status='ACCEPTED'
     ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
    [session.organization_id, session.id],
  );
  return result.rows[0]?.status ?? null;
}
