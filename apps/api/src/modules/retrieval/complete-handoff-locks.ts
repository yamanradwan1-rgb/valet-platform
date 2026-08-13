import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { CompleteHandoffError } from "./complete-handoff-errors";
import { assertReleaseCustody } from "./complete-handoff-guards";
import type {
  LockedCompleteHandoffRequest,
  LockedCompleteHandoffSession,
  LockedCompleteHandoffTask,
  LockedReleaseCustody,
} from "./complete-handoff-types";

export async function lockCompleteHandoffSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedCompleteHandoffSession> {
  const result = await transaction.query<LockedCompleteHandoffSession>(
    `SELECT id::text, organization_id::text, location_id::text,
            key_slot_id::text, state::text, version, retrieval_requested_at,
            retrieval_started_at, ready_at, handoff_pending_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new CompleteHandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return session;
}

export async function resolveCompleteHandoffActor(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined) {
    throw new CompleteHandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return membershipId;
}

export async function lockCompleteHandoffTask(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
): Promise<LockedCompleteHandoffTask> {
  const result = await transaction.query<LockedCompleteHandoffTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, status::text,
            current_assignee_membership_id::text, version, created_at
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'RETRIEVAL'
       AND status IN
         ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
     ORDER BY CASE WHEN status = 'IN_PROGRESS' THEN 0 ELSE 1 END,
              created_at DESC, id DESC
     LIMIT 1 FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (task === undefined) {
    throw new CompleteHandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export async function authorizeCompleteHandoffOwner(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
  task: LockedCompleteHandoffTask,
  membershipId: string,
): Promise<void> {
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (
    eligibility === null ||
    task.current_assignee_membership_id !== membershipId
  ) {
    throw new CompleteHandoffError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
}

export async function lockCompleteHandoffRequest(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
): Promise<LockedCompleteHandoffRequest> {
  const result = await transaction.query<LockedCompleteHandoffRequest>(
    `SELECT id::text, status::text FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status IN ('ACCEPTED', 'COMPLETED')
     ORDER BY CASE WHEN status = 'ACCEPTED' THEN 0 ELSE 1 END,
              created_at DESC, id DESC
     LIMIT 1 FOR UPDATE`,
    [session.organization_id, session.id],
  );
  const request = result.rows[0];
  if (request === undefined) {
    throw new CompleteHandoffError("RETRIEVAL_REQUEST_NOT_READY");
  }
  return request;
}

export async function lockReleaseCustody(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
): Promise<string> {
  const keySlotId = session.key_slot_id;
  if (keySlotId === null) {
    throw new CompleteHandoffError("KEY_CUSTODY_NOT_READY");
  }
  const slot = await transaction.query<{ id: string }>(
    `SELECT id::text FROM key_slots
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
     FOR SHARE`,
    [keySlotId, session.organization_id, session.location_id],
  );
  if (slot.rows[0] === undefined) {
    throw new CompleteHandoffError("KEY_CUSTODY_NOT_READY");
  }
  const history = await transaction.query<LockedReleaseCustody>(
    `SELECT event_type::text, key_slot_id::text
     FROM key_custody_events
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3
     ORDER BY occurred_at DESC, id DESC
     LIMIT 1`,
    [session.organization_id, session.location_id, session.id],
  );
  assertReleaseCustody(history.rows[0], keySlotId);
  return keySlotId;
}
