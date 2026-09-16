import type { PostgresTransaction } from "../../common/database/postgres";
import { ConfirmParkedError } from "./confirm-parked-errors";
import type {
  ConfirmParkedKeyBinding,
  LockedConfirmSession,
  LockedConfirmTask,
  LockedParkingTarget,
} from "./confirm-parked-types";

export async function completeParkingTask(
  transaction: PostgresTransaction,
  task: LockedConfirmTask,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE tasks
     SET status = 'COMPLETED', version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND status = 'IN_PROGRESS'
       AND current_assignee_membership_id = $4
     RETURNING version`,
    [task.id, task.version, operationTime, task.current_assignee_membership_id],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new ConfirmParkedError("VERSION_CONFLICT");
  return version;
}

export async function parkValetSession(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  parking: LockedParkingTarget,
  operationTime: Date,
  keyBinding: ConfirmParkedKeyBinding,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'PARKED', parked_at = $3, parking_zone_id = $4,
         parking_spot_id = $5, key_slot_id = $6, version = version + 1,
         updated_at = $3
     WHERE id = $1 AND version = $2 AND state = 'PARKING'
       AND parking_started_at IS NOT NULL AND parked_at IS NULL
       AND parking_spot_id IS NULL
       AND key_slot_id IS NOT DISTINCT FROM $7
       AND (parking_zone_id IS NULL OR parking_zone_id = $4)
     RETURNING version`,
    [
      session.id,
      session.version,
      operationTime,
      parking.parkingZoneId,
      parking.parkingSpotId,
      keyBinding.newKeySlotId,
      keyBinding.expectedCurrentKeySlotId,
    ],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new ConfirmParkedError("VERSION_CONFLICT");
  return version;
}
