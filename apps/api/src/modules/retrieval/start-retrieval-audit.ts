import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  LockedRetrievalRequest,
  LockedStartRetrievalSession,
  LockedStartRetrievalTask,
} from "./start-retrieval-types";

export async function appendStartRetrievalAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly operationTime: Date;
    readonly releasedParkingSpotId: string | null;
    readonly request: LockedRetrievalRequest;
    readonly session: LockedStartRetrievalSession;
    readonly sessionVersion: number;
    readonly task: LockedStartRetrievalTask;
    readonly taskVersion: number;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata = {
    fromRetrievalRequestStatus: "OPEN",
    fromSessionState: "REQUESTED",
    fromSessionVersion: input.session.version,
    fromTaskStatus: "ACCEPTED",
    fromTaskVersion: input.task.version,
    releasedParkingSpotId: input.releasedParkingSpotId,
    retrievalRequestId: input.request.id,
    taskId: input.task.id,
    toRetrievalRequestStatus: "ACCEPTED",
    toSessionState: "RETRIEVING",
    toSessionVersion: input.sessionVersion,
    toTaskStatus: "IN_PROGRESS",
    toTaskVersion: input.taskVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'VALET_SESSION_RETRIEVAL_STARTED',
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
