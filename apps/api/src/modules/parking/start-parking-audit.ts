import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  LockedStartParkingSession,
  LockedStartParkingTask,
} from "./start-parking-types";

export async function appendStartParkingAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly operationTime: Date;
    readonly session: LockedStartParkingSession;
    readonly sessionVersion: number;
    readonly task: LockedStartParkingTask;
    readonly taskVersion: number;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata = {
    fromSessionState: "AWAITING_PARKING",
    fromSessionVersion: input.session.version,
    fromTaskStatus: "ACCEPTED",
    fromTaskVersion: input.task.version,
    taskId: input.task.id,
    toSessionState: "PARKING",
    toSessionVersion: input.sessionVersion,
    toTaskStatus: "IN_PROGRESS",
    toTaskVersion: input.taskVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'VALET_SESSION_PARKING_STARTED',
             'VALET_SESSION', $4, $6::jsonb, $7)`,
    [
      auditEventId,
      input.session.organization_id,
      input.session.location_id,
      input.session.id,
      input.actorMembershipId,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
  return auditEventId;
}
