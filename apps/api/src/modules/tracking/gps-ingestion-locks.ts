import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { GpsIngestionError } from "./gps-ingestion-errors";
import type {
  LockedGpsSession,
  LockedGpsTask,
  LockedTrackingSession,
} from "./gps-ingestion-types";

export async function lockGpsSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedGpsSession> {
  const result = await transaction.query<LockedGpsSession>(
    `SELECT id::text, organization_id::text, location_id::text, state::text
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new GpsIngestionError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return session;
}

export async function resolveGpsActor(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined) {
    throw new GpsIngestionError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return membershipId;
}

export async function lockGpsTask(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
): Promise<LockedGpsTask> {
  const result = await transaction.query<LockedGpsTask>(
    `SELECT id::text, task_type::text, status::text,
            current_assignee_membership_id::text
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type IN ('PARKING', 'RETRIEVAL')
       AND status = 'IN_PROGRESS'
     ORDER BY id FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  if (result.rows.length !== 1) {
    throw new GpsIngestionError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return result.rows[0]!;
}

export async function authorizeGpsOwner(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  task: LockedGpsTask,
  membershipId: string,
): Promise<void> {
  if (task.current_assignee_membership_id !== membershipId) {
    throw new GpsIngestionError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null) {
    throw new GpsIngestionError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
}

export function assertGpsMovement(
  session: LockedGpsSession,
  task: LockedGpsTask,
): void {
  const matches =
    (task.task_type === "PARKING" && session.state === "PARKING") ||
    (task.task_type === "RETRIEVAL" && session.state === "RETRIEVING");
  if (!matches) throw new GpsIngestionError("TASK_INVALID_STATE");
}

export async function lockActiveTrackingSession(
  transaction: PostgresTransaction,
  session: LockedGpsSession,
  task: LockedGpsTask,
): Promise<LockedTrackingSession> {
  const policy = await transaction.query<{ tracking_enabled: boolean }>(
    `SELECT COALESCE(location.tracking_enabled_override,
                     organization.tracking_enabled) AS tracking_enabled
     FROM locations AS location
     INNER JOIN organizations AS organization
       ON organization.id = location.organization_id
     WHERE location.organization_id = $1 AND location.id = $2`,
    [session.organization_id, session.location_id],
  );
  if (policy.rows[0]?.tracking_enabled !== true) {
    throw new GpsIngestionError("TASK_INVALID_STATE");
  }
  const tracker = await transaction.query<LockedTrackingSession>(
    `SELECT id::text, started_at FROM task_tracking_sessions
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_id = $4 AND ended_at IS NULL
     FOR UPDATE`,
    [session.organization_id, session.location_id, session.id, task.id],
  );
  if (tracker.rows.length !== 1) {
    throw new GpsIngestionError("TASK_INVALID_STATE");
  }
  return tracker.rows[0]!;
}
