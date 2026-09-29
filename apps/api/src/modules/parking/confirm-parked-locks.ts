import type { PostgresTransaction } from "../../common/database/postgres";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { ConfirmParkedError } from "./confirm-parked-errors";
import type { LockedConfirmKeySlot, LockedConfirmSession, LockedConfirmTask } from "./confirm-parked-types";

export async function lockConfirmSession(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<LockedConfirmSession> {
  const result = await transaction.query<LockedConfirmSession>(
    `SELECT id::text, organization_id::text, location_id::text,
            key_slot_id::text, parking_zone_id::text, parking_spot_id::text,
            state::text, version, parking_started_at, parked_at
     FROM valet_sessions WHERE id = $1 FOR UPDATE`,
    [sessionId],
  );
  const session = result.rows[0];
  if (session === undefined) {
    throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return session;
}

export async function resolveConfirmActor(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  authenticatedUserId: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2`,
    [session.organization_id, authenticatedUserId],
  );
  const membershipId = result.rows[0]?.id;
  if (membershipId === undefined) {
    throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return membershipId;
}

export async function lockConfirmParkingTask(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
): Promise<LockedConfirmTask> {
  const result = await transaction.query<LockedConfirmTask>(
    `SELECT id::text, organization_id::text, location_id::text,
            valet_session_id::text, status::text,
            current_assignee_membership_id::text, version
     FROM tasks
     WHERE organization_id = $1 AND location_id = $2
       AND valet_session_id = $3 AND task_type = 'PARKING'
     ORDER BY CASE WHEN status IN
       ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS') THEN 0 ELSE 1 END,
       updated_at DESC, id
     LIMIT 1 FOR UPDATE`,
    [session.organization_id, session.location_id, session.id],
  );
  const task = result.rows[0];
  if (task === undefined) {
    throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return task;
}

export async function authorizeConfirmOwner(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  task: LockedConfirmTask,
  membershipId: string,
): Promise<void> {
  if (task.current_assignee_membership_id !== membershipId) {
    throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  const eligibility = await lockShiftOperationalEligibility(transaction, {
    locationId: session.location_id,
    membershipId,
  });
  if (eligibility === null) {
    throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
}

async function resolveScannedKeySlot(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  scannedKeySlotCode: string,
  scannedKeySlotId?: string,
): Promise<string> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM key_slots
     WHERE organization_id = $1 AND location_id = $2
       AND code = $3 AND status = 'ACTIVE'
       AND ($4::uuid IS NULL OR id = $4::uuid)
     FOR UPDATE`,
    [
      session.organization_id,
      session.location_id,
      scannedKeySlotCode,
      scannedKeySlotId ?? null,
    ],
  );
  const keySlotId = result.rows[0]?.id;
  if (keySlotId === undefined) {
    throw new ConfirmParkedError("KEY_CUSTODY_NOT_READY");
  }
  return keySlotId;
}

export async function lockConfirmKeySlot(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  scannedKeySlotCode: string,
  scannedKeySlotId?: string,
): Promise<LockedConfirmKeySlot> {
  if (session.key_slot_id === null) {
    const keySlotId = await resolveScannedKeySlot(
      transaction,
      session,
      scannedKeySlotCode,
      scannedKeySlotId,
    );
    const occupancy = await transaction.query<{ id: string }>(
      `SELECT id::text FROM valet_sessions
       WHERE organization_id = $1 AND location_id = $2
         AND key_slot_id = $3 AND id <> $4 LIMIT 1`,
      [session.organization_id, session.location_id, keySlotId, session.id],
    );
    if (occupancy.rows[0] !== undefined) {
      throw new ConfirmParkedError("KEY_CUSTODY_NOT_READY");
    }
    return {
      expectedCurrentKeySlotId: null,
      newKeySlotId: keySlotId,
      mode: "binding",
    };
  }
  const keySlotId = await resolveScannedKeySlot(
    transaction,
    session,
    scannedKeySlotCode,
    scannedKeySlotId,
  );
  if (keySlotId !== session.key_slot_id) {
    throw new ConfirmParkedError("KEY_CUSTODY_NOT_READY");
  }
  return {
    expectedCurrentKeySlotId: session.key_slot_id,
    newKeySlotId: keySlotId,
    mode: "legacy",
  };
}
