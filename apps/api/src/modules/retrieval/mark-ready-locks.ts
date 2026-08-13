import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { MarkReadyError } from "./mark-ready-errors";
import type {
  LockedMarkReadyRequest,
  LockedMarkReadySession,
  LockedMarkReadyTask,
} from "./mark-ready-types";

export async function lockMarkReadySession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedMarkReadySession> {
  const result = await transaction.query<LockedMarkReadySession>(
    `SELECT id::text, organization_id::text, location_id::text,
            key_slot_id::text, parking_zone_id::text, parking_spot_id::text,
            state::text, version, retrieval_requested_at, retrieval_started_at,
            ready_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined)
    throw new MarkReadyError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return session;
}

export async function resolveMarkReadyActor(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined)
    throw new MarkReadyError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return membershipId;
}

export async function lockMarkReadyRetrievalTask(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
): Promise<LockedMarkReadyTask> {
  const result = await transaction.query<LockedMarkReadyTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, status::text,
            current_assignee_membership_id::text, version
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'RETRIEVAL'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (task === undefined)
    throw new MarkReadyError("TASK_NOT_FOUND_OR_FORBIDDEN");
  return task;
}

export async function authorizeMarkReadyOwner(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
  task: LockedMarkReadyTask,
  membershipId: string,
): Promise<void> {
  if (task.current_assignee_membership_id !== membershipId) {
    throw new MarkReadyError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null)
    throw new MarkReadyError("TASK_NOT_FOUND_OR_FORBIDDEN");
}

export async function lockMarkReadyRetrievalRequest(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
): Promise<LockedMarkReadyRequest> {
  const result = await transaction.query<LockedMarkReadyRequest>(
    `SELECT id::text, status::text FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status IN ('OPEN', 'ACCEPTED')
     FOR UPDATE`,
    [session.organization_id, session.id],
  );
  const request = result.rows[0];
  if (request === undefined)
    throw new MarkReadyError("RETRIEVAL_REQUEST_NOT_READY");
  return request;
}
