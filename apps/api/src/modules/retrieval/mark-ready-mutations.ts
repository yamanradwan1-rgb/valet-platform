import type { PostgresTransaction } from "../../common/database/postgres";
import { MarkReadyError } from "./mark-ready-errors";
import type { LockedMarkReadySession } from "./mark-ready-types";

export async function markReadySession(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'READY', ready_at = $3,
         version = version + 1, updated_at = $3
     WHERE id = $1 AND version = $2 AND state = 'RETRIEVING'
       AND retrieval_requested_at IS NOT NULL
       AND retrieval_started_at IS NOT NULL AND ready_at IS NULL
     RETURNING version`,
    [session.id, session.version, operationTime],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) throw new MarkReadyError("VERSION_CONFLICT");
  return version;
}
