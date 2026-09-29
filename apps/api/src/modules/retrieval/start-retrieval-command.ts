import type { PostgresPool } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { recordKeyCheckedOut } from "../keys/parking-key-custody";
import { startTaskTrackingIfEnabled } from "../tracking/task-tracking-lifecycle";
import { appendStartRetrievalAuditEvent } from "./start-retrieval-audit";
import { StartRetrievalError } from "./start-retrieval-errors";
import {
  assertOpenRetrievalRequest,
  assertStartRetrievalGuards,
} from "./start-retrieval-guards";
import {
  authorizeStartRetrievalOwner,
  lockActiveRetrievalTask,
  lockRetrievalRequest,
  lockRetrievalResources,
  lockStartRetrievalSession,
  resolveStartRetrievalActor,
} from "./start-retrieval-locks";
import {
  acceptRetrievalRequest,
  startRetrievalSession,
  startRetrievalTask,
} from "./start-retrieval-mutations";
import type { StartRetrievalResult } from "./start-retrieval-types";

export interface StartRetrievalCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly expectedTaskVersion: number;
  readonly keySlotCode?: string;
  readonly keySlotId?: string;
  readonly sessionId: string;
}

export interface StartRetrievalCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

export function createStartRetrievalCommandExecutor(
  pool: PostgresPool,
  options: StartRetrievalCommandOptions = {},
) {
  return (
    request: StartRetrievalCommandRequest,
  ): Promise<StartRetrievalResult> =>
    inDispatchTransaction(pool, async (transaction) => {
      const session = await lockStartRetrievalSession(
        transaction,
        request.sessionId,
      );
      await lockManagementSettingsOrganization(
        transaction,
        session.organization_id,
        "SHARED",
      );
      const actorMembershipId = await resolveStartRetrievalActor(
        transaction,
        session,
        request.authenticatedUserId,
      );
      const task = await lockActiveRetrievalTask(transaction, session);
      await authorizeStartRetrievalOwner(
        transaction,
        session,
        task,
        actorMembershipId,
      );
      assertStartRetrievalGuards(session, task, request);
      const retrievalRequest = await lockRetrievalRequest(transaction, session);
      assertOpenRetrievalRequest(retrievalRequest);
      const resources = await lockRetrievalResources(transaction, session, {
        ...(request.keySlotCode === undefined
          ? {}
          : { keySlotCode: request.keySlotCode }),
        ...(request.keySlotId === undefined
          ? {}
          : { keySlotId: request.keySlotId }),
      });
      const operationTime = await loadDispatchOperationTime(transaction);
      const taskVersion = await startRetrievalTask(
        transaction,
        task,
        operationTime,
      );
      const sessionVersion = await startRetrievalSession(
        transaction,
        session,
        operationTime,
      );
      await acceptRetrievalRequest(transaction, retrievalRequest, session);
      await startTaskTrackingIfEnabled(
        transaction,
        {
          locationId: session.location_id,
          organizationId: session.organization_id,
          sessionId: session.id,
          taskId: task.id,
        },
        operationTime,
        () => {
          throw new StartRetrievalError("TASK_INVALID_STATE");
        },
      );
      await recordKeyCheckedOut(
        transaction,
        {
          actorMembershipId,
          keySlotId: resources.keySlotId,
          locationId: session.location_id,
          occurredAt: operationTime,
          organizationId: session.organization_id,
          sessionId: session.id,
        },
        options.custodyEventIdFactory,
      );
      await appendDispatchEvent(
        transaction,
        {
          actorMembershipId,
          eventType: "IN_PROGRESS",
          newAssigneeMembershipId: actorMembershipId,
          occurredAt: operationTime,
          previousAssigneeMembershipId: null,
          reason: null,
          task,
        },
        options.dispatchEventIdFactory,
      );
      await appendStartRetrievalAuditEvent(
        transaction,
        {
          actorMembershipId,
          operationTime,
          releasedParkingSpotId: resources.parkingSpotId,
          request: retrievalRequest,
          session,
          sessionVersion,
          task,
          taskVersion,
        },
        options.auditEventIdFactory,
      );
      return {
        retrievalStartedAt: operationTime.toISOString(),
        sessionId: session.id,
        sessionVersion,
        state: "RETRIEVING",
        taskId: task.id,
        taskStatus: "IN_PROGRESS",
        taskVersion,
      };
    });
}
