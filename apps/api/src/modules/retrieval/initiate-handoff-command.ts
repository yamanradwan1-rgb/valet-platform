import type { PostgresPool } from "../../common/database/postgres";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendHandoffAudit } from "./handoff-audit";
import { HandoffError } from "./handoff-errors";
import {
  assertHandoffLifecycle,
  authorizeHandoffOwner,
  lockHandoffRequest,
  lockHandoffSession,
  lockHandoffTask,
  resolveHandoffActor,
} from "./handoff-locks";

export interface InitiateHandoffRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly sessionId: string;
}

export function createInitiateHandoffExecutor(pool: PostgresPool) {
  return (input: InitiateHandoffRequest) =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockHandoffSession(transaction, input.sessionId);
      const actor = await resolveHandoffActor(
        transaction,
        session,
        input.authenticatedUserId,
      );
      const task = await lockHandoffTask(transaction, session);
      await authorizeHandoffOwner(transaction, session, task, actor);
      const request = await lockHandoffRequest(transaction, session);
      assertHandoffLifecycle(
        session,
        task,
        request,
        input.expectedSessionVersion,
        "READY",
      );
      const operationTime = await loadDispatchOperationTime(transaction);
      const updated = await transaction.query<{ version: number }>(
        `UPDATE valet_sessions
         SET state = 'HANDOFF_PENDING', handoff_pending_at = $3,
             version = version + 1, updated_at = $3
         WHERE id = $1 AND version = $2 AND state = 'READY'
           AND ready_at IS NOT NULL AND handoff_pending_at IS NULL
         RETURNING version`,
        [session.id, session.version, operationTime],
      );
      const sessionVersion = updated.rows[0]?.version;
      if (sessionVersion === undefined)
        throw new HandoffError("VERSION_CONFLICT");
      await appendHandoffAudit(transaction, {
        actorMembershipId: actor.membershipId,
        eventType: "VALET_SESSION_HANDOFF_INITIATED",
        metadata: {
          from_state: "READY",
          from_version: session.version,
          task_id: task.id,
          to_state: "HANDOFF_PENDING",
          to_version: sessionVersion,
        },
        occurredAt: operationTime,
        session,
      });
      return {
        handoffPendingAt: operationTime.toISOString(),
        sessionId: session.id,
        sessionVersion,
        state: "HANDOFF_PENDING" as const,
        taskId: task.id,
        taskStatus: "IN_PROGRESS" as const,
        taskVersion: task.version,
      };
    });
}
