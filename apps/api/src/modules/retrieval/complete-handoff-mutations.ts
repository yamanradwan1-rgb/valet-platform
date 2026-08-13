import type { PostgresTransaction } from "../../common/database/postgres";
import { CompleteHandoffError } from "./complete-handoff-errors";
import type {
  LockedCompleteHandoffRequest,
  LockedCompleteHandoffSession,
  LockedCompleteHandoffTask,
} from "./complete-handoff-types";

export async function consumeReleaseVerification(
  transaction: PostgresTransaction,
  verificationId: string,
  operationTime: Date,
): Promise<void> {
  const result = await transaction.query(
    `UPDATE handoff_verifications SET consumed_at = $2
     WHERE id = $1 AND verified_at IS NOT NULL AND consumed_at IS NULL`,
    [verificationId, operationTime],
  );
  if (result.rowCount !== 1) {
    throw new CompleteHandoffError("HANDOFF_VERIFICATION_FAILED");
  }
}

export async function completeRetrievalRequest(
  transaction: PostgresTransaction,
  request: LockedCompleteHandoffRequest,
  session: LockedCompleteHandoffSession,
): Promise<void> {
  const result = await transaction.query(
    `UPDATE retrieval_requests SET status = 'COMPLETED'
     WHERE id = $1 AND organization_id = $2 AND valet_session_id = $3
       AND status = 'ACCEPTED'`,
    [request.id, session.organization_id, session.id],
  );
  if (result.rowCount !== 1) {
    throw new CompleteHandoffError("RETRIEVAL_REQUEST_NOT_READY");
  }
}

export async function completeRetrievalTask(
  transaction: PostgresTransaction,
  task: LockedCompleteHandoffTask,
  actorMembershipId: string,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE tasks
     SET status = 'COMPLETED', version = version + 1, updated_at = $4
     WHERE id = $1 AND version = $2 AND status = 'IN_PROGRESS'
       AND current_assignee_membership_id = $3
     RETURNING version`,
    [task.id, task.version, actorMembershipId, operationTime],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) {
    throw new CompleteHandoffError("VERSION_CONFLICT");
  }
  return version;
}

export async function completeHandoffSession(
  transaction: PostgresTransaction,
  session: LockedCompleteHandoffSession,
  actorMembershipId: string,
  keySlotId: string,
  operationTime: Date,
): Promise<number> {
  const result = await transaction.query<{ version: number }>(
    `UPDATE valet_sessions
     SET state = 'COMPLETED', completed_at = $5,
         completed_by_membership_id = $3, key_slot_id = NULL,
         version = version + 1, updated_at = $5
     WHERE id = $1 AND version = $2 AND state = 'HANDOFF_PENDING'
       AND handoff_pending_at IS NOT NULL AND key_slot_id = $4
     RETURNING version`,
    [session.id, session.version, actorMembershipId, keySlotId, operationTime],
  );
  const version = result.rows[0]?.version;
  if (version === undefined) {
    throw new CompleteHandoffError("VERSION_CONFLICT");
  }
  return version;
}
