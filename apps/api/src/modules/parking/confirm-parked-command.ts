import type { PostgresPool } from "../../common/database/postgres";
import { lockManagementSettingsOrganization } from "../../common/database/management-settings-lock";
import { appendDispatchEvent } from "../dispatch/dispatch-event-writer";
import {
  inDispatchTransaction,
  loadDispatchOperationTime,
} from "../dispatch/dispatch-transaction";
import { appendKeyAuditEvent } from "../keys/key-audit-event-writer";
import { appendKeyCustodyEvent } from "../keys/key-custody-event-writer";
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
import {
  lockConfirmParkingSpot,
  lockConfirmParkingZone,
  parkingSpotTarget,
} from "./confirm-parked-resources";
import type { ConfirmParkedResult } from "./confirm-parked-types";

export interface ConfirmParkedCommandRequest {
  readonly authenticatedUserId: string;
  readonly expectedSessionVersion: number;
  readonly expectedTaskVersion: number;
  readonly keySlotCode: string;
  readonly parkingSpotCode?: string;
  readonly parkingZoneCode?: string;
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
    await lockManagementSettingsOrganization(
      transaction,
      session.organization_id,
      "SHARED",
    );
    const actorMembershipId = await resolveConfirmActor(
      transaction,
      session,
      request.authenticatedUserId,
    );
    const task = await lockConfirmParkingTask(transaction, session);
    await authorizeConfirmOwner(transaction, session, task, actorMembershipId);
    assertConfirmParkedGuards(session, task, request);
    const policy = await transaction.query<{ parkingSpotRequired: boolean }>(
      `SELECT COALESCE(location.parking_spot_required_override,
                       organization.parking_spot_required) AS "parkingSpotRequired"
       FROM locations AS location
       INNER JOIN organizations AS organization
         ON organization.id = location.organization_id
       WHERE location.id = $1 AND location.organization_id = $2`,
      [session.location_id, session.organization_id],
    );
    const parkingSpotRequired = policy.rows[0]?.parkingSpotRequired;
    if (parkingSpotRequired === undefined) {
      throw new ConfirmParkedError("TASK_NOT_FOUND_OR_FORBIDDEN");
    }
    if (parkingSpotRequired && request.parkingSpotCode === undefined) {
      throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
    }
    const lockedKeySlot = await lockConfirmKeySlot(
      transaction,
      session,
      request.keySlotCode.trim(),
    );
    const parking = request.parkingSpotCode !== undefined
      ? parkingSpotTarget(await lockConfirmParkingSpot(
          transaction,
          session,
          request.parkingSpotCode.trim(),
        ))
      : await lockConfirmParkingZone(
          transaction,
          session,
          request.parkingZoneCode!.trim(),
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
      parking,
      operationTime,
      lockedKeySlot,
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
    if (lockedKeySlot.mode === "binding") {
      await appendKeyCustodyEvent(
        transaction,
        {
          actorMembershipId,
          eventType: "SLOT_ASSIGNED",
          keySlotId: lockedKeySlot.newKeySlotId,
          locationId: session.location_id,
          occurredAt: operationTime,
          organizationId: session.organization_id,
          sessionId: session.id,
        },
        options.custodyEventIdFactory,
      );
    }
    await recordKeyReturnedToSlot(
      transaction,
      {
        actorMembershipId,
        keySlotId: lockedKeySlot.newKeySlotId,
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
    if (lockedKeySlot.mode === "binding") {
      await appendKeyAuditEvent(
        transaction,
        {
          actorMembershipId,
          currentKeySlotId: lockedKeySlot.newKeySlotId,
          eventType: "VALET_SESSION_KEY_SLOT_ASSIGNED",
          fromVersion: session.version,
          locationId: session.location_id,
          occurredAt: operationTime,
          organizationId: session.organization_id,
          previousKeySlotId: null,
          sessionId: session.id,
          toVersion: sessionVersion,
        },
        options.auditEventIdFactory,
      );
    }
    await appendConfirmParkedAuditEvent(
      transaction,
      {
        actorMembershipId,
        operationTime,
        session,
        sessionVersion,
        parking,
        task,
        taskVersion,
      },
      options.auditEventIdFactory,
    );
    return {
      parkedAt: operationTime.toISOString(),
      parkingSpotCode: parking.parkingSpotCode,
      parkingSpotId: parking.parkingSpotId,
      parkingZoneId: parking.parkingZoneId,
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
      if (
        postgres.code === "23505" &&
        postgres.constraint === "valet_sessions_key_slot_id_key"
      ) {
        throw new ConfirmParkedError("KEY_CUSTODY_NOT_READY");
      }
      throw error;
    }
  };
}
