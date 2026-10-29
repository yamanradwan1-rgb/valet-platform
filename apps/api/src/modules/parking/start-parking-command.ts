import type { PostgresPool } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { recordKeyCheckedOut } from "../keys/parking-key-custody";
import { startTaskTrackingIfEnabled } from "../tracking/task-tracking-lifecycle";
import { appendStartParkingAuditEvent } from "./start-parking-audit";
import { StartParkingError } from "./start-parking-errors";
import { assertStartParkingGuards } from "./start-parking-guards";
import {
  authorizeStartParkingOwner,
  lockActiveParkingTask,
  lockOptionalCurrentKeySlot,
  lockStartParkingSession,
  resolveStartParkingActor,
} from "./start-parking-locks";
import {
  startParkingSession,
  startParkingTask,
} from "./start-parking-mutations";
import type { StartParkingResult } from "./start-parking-types";

export interface StartParkingCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly expectedTaskVersion: number;
  readonly sessionId: string;
}

export interface StartParkingCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

async function executeStartParking(
  pool: PostgresPool,
  request: StartParkingCommandRequest,
  options: StartParkingCommandOptions,
): Promise<StartParkingResult> {
  return inDispatchTransaction(pool, async (transaction) => {
    const session = await lockStartParkingSession(
      transaction,
      request.sessionId,
    );
    await lockManagementSettingsOrganization(
      transaction,
      session.organization_id,
      "SHARED",
    );
    const actorMembershipId = await resolveStartParkingActor(
      transaction,
      session,
      request.authenticatedUserId,
    );
    const task = await lockActiveParkingTask(transaction, session);
    await authorizeStartParkingOwner(
      transaction,
      session,
      task,
      actorMembershipId,
    );
    assertStartParkingGuards(session, task, request);
    const keySlotId = await lockOptionalCurrentKeySlot(transaction, session);
    const operationTime = await loadDispatchOperationTime(transaction);
    const taskVersion = await startParkingTask(
      transaction,
      task,
      operationTime,
    );
    const sessionVersion = await startParkingSession(
      transaction,
      session,
      operationTime,
    );
    await startTaskTrackingIfEnabled(
      transaction,
      {
        assigneeMembershipId: actorMembershipId,
        locationId: session.location_id,
        organizationId: session.organization_id,
        sessionId: session.id,
        taskId: task.id,
      },
      operationTime,
      () => {
        throw new StartParkingError("TASK_INVALID_STATE");
      },
    );
    if (keySlotId !== null) {
      await recordKeyCheckedOut(
        transaction,
        {
          actorMembershipId,
          keySlotId,
          locationId: session.location_id,
          occurredAt: operationTime,
          organizationId: session.organization_id,
          sessionId: session.id,
        },
        options.custodyEventIdFactory,
      );
    }
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
    await appendStartParkingAuditEvent(
      transaction,
      {
        actorMembershipId,
        operationTime,
        session,
        sessionVersion,
        task,
        taskVersion,
      },
      options.auditEventIdFactory,
    );
    return {
      parkingStartedAt: operationTime.toISOString(),
      sessionId: session.id,
      sessionVersion,
      state: "PARKING",
      taskId: task.id,
      taskStatus: "IN_PROGRESS",
      taskVersion,
    };
  });
}

export function createStartParkingCommandExecutor(
  pool: PostgresPool,
  options: StartParkingCommandOptions = {},
) {
  return (request: StartParkingCommandRequest) =>
    executeStartParking(pool, request, options);
}
