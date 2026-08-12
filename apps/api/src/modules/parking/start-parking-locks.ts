import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { StartParkingError } from "./start-parking-errors";
import type {
  LockedStartParkingSession,
  LockedStartParkingTask,
} from "./start-parking-types";

export async function lockStartParkingSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedStartParkingSession> {
  const result = await transaction.query<LockedStartParkingSession>(
    `SELECT id::text, organization_id::text, location_id::text,
            key_slot_id::text, state::text, version, parking_started_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new StartParkingError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return session;
}

export async function resolveStartParkingActor(
  transaction: PostgresTransaction,
  session: LockedStartParkingSession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined) {
    throw new StartParkingError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return membershipId;
}

export async function lockActiveParkingTask(
  transaction: PostgresTransaction,
  session: LockedStartParkingSession,
): Promise<LockedStartParkingTask> {
  const result = await transaction.query<LockedStartParkingTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, task_type::text, status::text,
            current_assignee_membership_id::text, version
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'PARKING'
       AND status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
     FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (task === undefined) {
    throw new StartParkingError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export async function authorizeStartParkingOwner(
  transaction: PostgresTransaction,
  session: LockedStartParkingSession,
  task: LockedStartParkingTask,
  membershipId: string,
): Promise<void> {
  if (task.current_assignee_membership_id !== membershipId) {
    throw new StartParkingError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null) {
    throw new StartParkingError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
}

export async function lockActiveCurrentKeySlot(
  transaction: PostgresTransaction,
  session: LockedStartParkingSession,
): Promise<string> {
  if (session.key_slot_id === null) {
    throw new StartParkingError("KEY_CUSTODY_NOT_READY");
  }
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM key_slots
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
       AND status = 'ACTIVE'
     FOR UPDATE`,
    [session.key_slot_id, session.organization_id, session.location_id],
  );
  const keySlotId = result.rows[0]?.id;
  if (keySlotId === undefined) {
    throw new StartParkingError("KEY_CUSTODY_NOT_READY");
  }
  return keySlotId;
}
