import type { PostgresPool } from "../../common/database/postgres";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendMarkReadyAuditEvent } from "./mark-ready-audit";
import {
  assertAcceptedRetrievalRequest,
  assertMarkReadySession,
  assertMarkReadyTask,
  assertMarkReadyVersion,
} from "./mark-ready-guards";
import {
  authorizeMarkReadyOwner,
  lockMarkReadyRetrievalRequest,
  lockMarkReadyRetrievalTask,
  lockMarkReadySession,
  resolveMarkReadyActor,
} from "./mark-ready-locks";
import { markReadySession } from "./mark-ready-mutations";
import type { MarkReadyResult } from "./mark-ready-types";

export interface MarkReadyCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly sessionId: string;
}

export interface MarkReadyCommandOptions {
  readonly auditEventIdFactory?: () => string;
}

export function createMarkReadyCommandExecutor(
  pool: PostgresPool,
  options: MarkReadyCommandOptions = {},
) {
  return (request: MarkReadyCommandRequest): Promise<MarkReadyResult> =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockMarkReadySession(
        transaction,
        request.sessionId,
      );
      const actorMembershipId = await resolveMarkReadyActor(
        transaction,
        session,
        request.authenticatedUserId,
      );
      const task = await lockMarkReadyRetrievalTask(transaction, session);
      await authorizeMarkReadyOwner(
        transaction,
        session,
        task,
        actorMembershipId,
      );
      assertMarkReadyVersion(session, request.expectedSessionVersion);
      assertMarkReadyTask(task);
      assertMarkReadySession(session);
      const retrievalRequest = await lockMarkReadyRetrievalRequest(
        transaction,
        session,
      );
      assertAcceptedRetrievalRequest(retrievalRequest);
      const operationTime = await loadDispatchOperationTime(transaction);
      const sessionVersion = await markReadySession(
        transaction,
        session,
        operationTime,
      );
      await appendMarkReadyAuditEvent(
        transaction,
        { actorMembershipId, operationTime, session, sessionVersion, task },
        options.auditEventIdFactory,
      );
      return {
        readyAt: operationTime.toISOString(),
        sessionId: session.id,
        sessionVersion,
        state: "READY",
        taskId: task.id,
        taskStatus: "IN_PROGRESS",
        taskVersion: task.version,
      };
    });
}
