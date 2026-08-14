import type { PostgresPool } from "../../common/database/postgres";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { recordKeyReturnedToSlot } from "../keys/parking-key-custody";
import { stopTaskTrackingForMovement } from "../tracking/task-tracking-lifecycle";
import { appendConfirmParkedAuditEvent } from "./confirm-parked-audit";
import { ConfirmParkedError } from "./confirm-parked-errors";
import { assertConfirmParkedGuards } from "./confirm-parked-guards";
import {
  authorizeConfirmOwner,
  lockConfirmKeySlot,
  lockConfirmParkingTask,
  lockConfirmSession,
  resolveConfirmActor,
} from "./confirm-parked-locks";
import {
  completeParkingTask,
  parkValetSession,
} from "./confirm-parked-mutations";
import { lockConfirmParkingSpot } from "./confirm-parked-resources";
import type { ConfirmParkedResult } from "./confirm-parked-types";

export interface ConfirmParkedCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly expectedTaskVersion: number;
  readonly parkingSpotCode: string;
  readonly sessionId: string;
}

export interface ConfirmParkedCommandOptions {
  readonly auditEventIdFactory?: () => string;
  readonly custodyEventIdFactory?: () => string;
  readonly dispatchEventIdFactory?: () => string;
}

async function executeConfirmParked(
  pool: PostgresPool,
  request: ConfirmParkedCommandRequest,
  options: ConfirmParkedCommandOptions,
): Promise<ConfirmParkedResult> {
  return inDispatchTransaction(pool, async (transaction) => {
    const session = await lockConfirmSession(transaction, request.sessionId);
    const actorMembershipId = await resolveConfirmActor(
      transaction,
      session,
      request.authenticatedUserId,
    );
    const task = await lockConfirmParkingTask(transaction, session);
    await authorizeConfirmOwner(transaction, session, task, actorMembershipId);
    assertConfirmParkedGuards(session, task, request);
    const keySlotId = await lockConfirmKeySlot(transaction, session);
    const spot = await lockConfirmParkingSpot(
      transaction,
      session,
      request.parkingSpotCode.trim(),
    );
    const operationTime = await loadDispatchOperationTime(transaction);
    const taskVersion = await completeParkingTask(
      transaction,
      task,
      operationTime,
    );
    const sessionVersion = await parkValetSession(
      transaction,
      session,
      spot,
      operationTime,
    );
    await stopTaskTrackingForMovement(
      transaction,
      {
        locationId: session.location_id,
        organizationId: session.organization_id,
        sessionId: session.id,
        taskId: task.id,
      },
      operationTime,
      () => {
        throw new ConfirmParkedError("TASK_INVALID_STATE");
      },
    );
    await recordKeyReturnedToSlot(
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
    await appendDispatchEvent(
      transaction,
      {
        actorMembershipId,
        eventType: "COMPLETED",
        newAssigneeMembershipId: actorMembershipId,
        occurredAt: operationTime,
        previousAssigneeMembershipId: null,
        reason: null,
        task,
      },
      options.dispatchEventIdFactory,
    );
    await appendConfirmParkedAuditEvent(
      transaction,
      {
        actorMembershipId,
        operationTime,
        session,
        sessionVersion,
        spot,
        task,
        taskVersion,
      },
      options.auditEventIdFactory,
    );
    return {
      parkedAt: operationTime.toISOString(),
      parkingSpotCode: spot.code,
      parkingSpotId: spot.id,
      parkingZoneId: spot.parking_zone_id,
      sessionId: session.id,
      sessionVersion,
      state: "PARKED",
      taskId: task.id,
      taskStatus: "COMPLETED",
      taskVersion,
    };
  });
}

export function createConfirmParkedCommandExecutor(
  pool: PostgresPool,
  options: ConfirmParkedCommandOptions = {},
) {
  return async (request: ConfirmParkedCommandRequest) => {
    try {
      return await executeConfirmParked(pool, request, options);
    } catch (error) {
      const postgres = error as { code?: unknown; constraint?: unknown };
      if (
        postgres.code === "23505" &&
        postgres.constraint === "valet_sessions_parking_spot_id_key"
      ) {
        throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
      }
      throw error;
    }
  };
}
