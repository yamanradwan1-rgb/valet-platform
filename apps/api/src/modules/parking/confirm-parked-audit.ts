import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  LockedConfirmSession,
  LockedConfirmTask,
  LockedParkingSpot,
} from "./confirm-parked-types";

export async function appendConfirmParkedAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly operationTime: Date;
    readonly session: LockedConfirmSession;
    readonly sessionVersion: number;
    readonly spot: LockedParkingSpot;
    readonly task: LockedConfirmTask;
    readonly taskVersion: number;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const eventId = auditEventIdFactory();
  const metadata = {
    fromSessionState: "PARKING",
    fromSessionVersion: input.session.version,
    fromTaskStatus: "IN_PROGRESS",
    fromTaskVersion: input.task.version,
    parkingSpotId: input.spot.id,
    parkingZoneId: input.spot.parking_zone_id,
    taskId: input.task.id,
    toSessionState: "PARKED",
    toSessionVersion: input.sessionVersion,
    toTaskStatus: "COMPLETED",
    toTaskVersion: input.taskVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'VALET_SESSION_PARKED',
             'VALET_SESSION', $4, $6::jsonb, $7)`,
    [
      eventId,
      input.session.organization_id,
      input.session.location_id,
      input.session.id,
      input.actorMembershipId,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
  return eventId;
}
