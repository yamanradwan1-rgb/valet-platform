import type { PostgresTransaction } from "../../common/database/postgres";
import { StartParkingError } from "./start-parking-errors";
import type {
  LockedStartParkingSession,
  LockedStartParkingTask,
} from "./start-parking-types";

export async function startParkingTask(
  transaction: PostgresTransaction,
  task: LockedStartParkingTask,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE tasks
     SET status = 'IN_PROGRESS', version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND status = 'ACCEPTED'
       AND current_assignee_membership_id = $4
     RETURNING version`,
    [task.id, task.version, operationTime, task.current_assignee_membership_id],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new StartParkingError("VERSION_CONFLICT");
  return version;
}

export async function startParkingSession(
  transaction: PostgresTransaction,
  session: LockedStartParkingSession,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'PARKING', parking_started_at = $3,
         version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND state = 'AWAITING_PARKING'
       AND parking_started_at IS NULL
       AND key_slot_id IS NOT DISTINCT FROM $4
     RETURNING version`,
    [session.id, session.version, operationTime, session.key_slot_id],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new StartParkingError("VERSION_CONFLICT");
  return version;
}
