import type { PostgresTransaction } from "../../common/database/postgres";
import { StartRetrievalError } from "./start-retrieval-errors";
import type {
  LockedRetrievalRequest,
  LockedStartRetrievalSession,
  LockedStartRetrievalTask,
} from "./start-retrieval-types";

export async function startRetrievalTask(
  transaction: PostgresTransaction,
  task: LockedStartRetrievalTask,
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
  if (version === undefined) throw new StartRetrievalError("VERSION_CONFLICT");
  return version;
}

export async function startRetrievalSession(
  transaction: PostgresTransaction,
  session: LockedStartRetrievalSession,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'RETRIEVING', retrieval_started_at = $3,
         parking_spot_id = NULL, version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND state = 'REQUESTED'
       AND retrieval_requested_at IS NOT NULL
       AND retrieval_started_at IS NULL AND key_slot_id = $4
       AND parking_spot_id = $5
     RETURNING version`,
    [
      session.id,
      session.version,
      operationTime,
      session.key_slot_id,
      session.parking_spot_id,
    ],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new StartRetrievalError("VERSION_CONFLICT");
  return version;
}

export async function acceptRetrievalRequest(
  transaction: PostgresTransaction,
  request: LockedRetrievalRequest,
  session: LockedStartRetrievalSession,
): Promise<void> {
  const result = await transaction.query(
    `UPDATE retrieval_requests SET status = 'ACCEPTED'
     WHERE id = $1 AND organization_id = $2 AND valet_session_id = $3
       AND status = 'OPEN'`,
    [request.id, session.organization_id, session.id],
  );
  if (result.rowCount !== 1) {
    throw new StartRetrievalError("RETRIEVAL_REQUEST_NOT_READY");
  }
}
