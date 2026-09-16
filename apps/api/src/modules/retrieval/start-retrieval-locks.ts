import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { StartRetrievalError } from "./start-retrieval-errors";
import type {
  LockedRetrievalRequest,
  LockedStartRetrievalSession,
  LockedStartRetrievalTask,
} from "./start-retrieval-types";

export async function lockStartRetrievalSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedStartRetrievalSession> {
  const result = await transaction.query<LockedStartRetrievalSession>(
    `SELECT id::text, organization_id::text, location_id::text,
            key_slot_id::text, parking_zone_id::text, parking_spot_id::text,
            state::text, version, parked_at, retrieval_requested_at,
            retrieval_started_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new StartRetrievalError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return session;
}

export async function resolveStartRetrievalActor(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined) {
    throw new StartRetrievalError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return membershipId;
}

export async function lockActiveRetrievalTask(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
): Promise<LockedStartRetrievalTask> {
  const result = await transaction.query<LockedStartRetrievalTask>(
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
  if (task === undefined) {
    throw new StartRetrievalError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export async function authorizeStartRetrievalOwner(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
  task: LockedStartRetrievalTask,
  membershipId: string,
): Promise<void> {
  if (task.current_assignee_membership_id !== membershipId) {
    throw new StartRetrievalError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null) {
    throw new StartRetrievalError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
}

export async function lockRetrievalRequest(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
): Promise<LockedRetrievalRequest> {
  const result = await transaction.query<LockedRetrievalRequest>(
    `SELECT id::text, status::text FROM retrieval_requests
     WHERE organization_id = $1 AND valet_session_id = $2
       AND status IN ('OPEN', 'ACCEPTED')
     FOR UPDATE`,
    [session.organization_id, session.id],
  );
  const request = result.rows[0];
  if (request === undefined) {
    throw new StartRetrievalError("RETRIEVAL_REQUEST_NOT_READY");
  }
  return request;
}

export async function lockRetrievalResources(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
): Promise<{ readonly keySlotId: string; readonly parkingSpotId: string | null }> {
  if (session.key_slot_id === null || session.parking_zone_id === null) {
    throw new StartRetrievalError("KEY_CUSTODY_NOT_READY");
  }
  const keySlot = await transaction.query<{ id: string }>(
    `SELECT id::text FROM key_slots
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
       AND status = 'ACTIVE' FOR UPDATE`,
    [session.key_slot_id, session.organization_id, session.location_id],
  );
  if (keySlot.rows[0] === undefined) {
    throw new StartRetrievalError("KEY_CUSTODY_NOT_READY");
  }
  let parkingSpotId: string | null = null;
  if (session.parking_spot_id !== null) {
    const parkingSpot = await transaction.query<{ id: string }>(
      `SELECT id::text FROM parking_spots
       WHERE id = $1 AND organization_id = $2 AND location_id = $3
       FOR UPDATE`,
      [session.parking_spot_id, session.organization_id, session.location_id],
    );
    parkingSpotId = parkingSpot.rows[0]?.id ?? null;
    if (parkingSpotId === null) {
      throw new StartRetrievalError("INVALID_STATE_TRANSITION");
    }
  }
  return { keySlotId: keySlot.rows[0].id, parkingSpotId };
}
