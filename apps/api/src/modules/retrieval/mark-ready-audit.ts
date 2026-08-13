import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  LockedMarkReadySession,
  LockedMarkReadyTask,
} from "./mark-ready-types";

export async function appendMarkReadyAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly operationTime: Date;
    readonly session: LockedMarkReadySession;
    readonly sessionVersion: number;
    readonly task: LockedMarkReadyTask;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata = {
    fromState: "RETRIEVING",
    fromVersion: input.session.version,
    taskId: input.task.id,
    toState: "READY",
    toVersion: input.sessionVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'VALET_SESSION_READY',
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
