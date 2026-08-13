import type { PostgresPool } from "../../common/database/postgres";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendHandoffAudit } from "./handoff-audit";
import { HandoffError } from "./handoff-errors";
import {
  assertHandoffLifecycle,
  authorizeHandoffAbort,
  lockHandoffRequest,
  lockHandoffSession,
  lockHandoffTask,
  resolveHandoffActor,
} from "./handoff-locks";

export interface AbortHandoffRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly reason: string;
  readonly sessionId: string;
}

export function createAbortHandoffExecutor(pool: PostgresPool) {
  return (input: AbortHandoffRequest) =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockHandoffSession(transaction, input.sessionId);
      const actor = await resolveHandoffActor(
        transaction,
        session,
        input.authenticatedUserId,
      );
      const task = await lockHandoffTask(transaction, session);
      await authorizeHandoffAbort(transaction, session, task, actor);
      const request = await lockHandoffRequest(transaction, session);
      assertHandoffLifecycle(
        session,
        task,
        request,
        input.expectedSessionVersion,
        "HANDOFF_PENDING",
      );
      const reason = input.reason.trim();
      if (reason.length === 0 || reason.length > 500) {
        throw new HandoffError("HANDOFF_ABORT_REASON_REQUIRED");
      }
      const operationTime = await loadDispatchOperationTime(transaction);
      await transaction.query(
        `UPDATE handoff_verifications SET consumed_at = $3
         WHERE organization_id = $1 AND valet_session_id = $2
           AND consumed_at IS NULL`,
        [session.organization_id, session.id, operationTime],
      );
      const updated = await transaction.query<{ version: number }>(
        `UPDATE valet_sessions
         SET state = 'READY', handoff_pending_at = NULL,
             version = version + 1, updated_at = $3
         WHERE id = $1 AND version = $2 AND state = 'HANDOFF_PENDING'
         RETURNING version`,
        [session.id, session.version, operationTime],
      );
      const sessionVersion = updated.rows[0]?.version;
      if (sessionVersion === undefined)
        throw new HandoffError("VERSION_CONFLICT");
      await appendHandoffAudit(transaction, {
        actorMembershipId: actor.membershipId,
        eventType: "VALET_SESSION_HANDOFF_ABORTED",
        metadata: {
          from_state: "HANDOFF_PENDING",
          from_version: session.version,
          reason,
          task_id: task.id,
          to_state: "READY",
          to_version: sessionVersion,
        },
        occurredAt: operationTime,
        session,
      });
      return {
        sessionId: session.id,
        sessionVersion,
        state: "READY" as const,
        taskId: task.id,
        taskStatus: "IN_PROGRESS" as const,
        taskVersion: task.version,
      };
    });
}
