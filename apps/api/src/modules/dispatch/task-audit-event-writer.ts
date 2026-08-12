import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { LockedTaskRow, OperationalTaskStatus } from "./dispatch-types";

export type TaskAuditEventType =
  "TASK_ASSIGNED" | "TASK_ACCEPTED" | "TASK_DECLINED" | "TASK_REASSIGNED";

export async function appendTaskAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly eventType: TaskAuditEventType;
    readonly fromStatus: OperationalTaskStatus;
    readonly newAssigneeMembershipId: string | null;
    readonly occurredAt: Date;
    readonly previousAssigneeMembershipId: string | null;
    readonly reason: string | null;
    readonly task: LockedTaskRow;
    readonly toStatus: OperationalTaskStatus;
    readonly toVersion: number;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const id = auditEventIdFactory();
  const metadata = {
    fromStatus: input.fromStatus,
    fromVersion: input.task.version,
    newAssigneeMembershipId: input.newAssigneeMembershipId,
    previousAssigneeMembershipId: input.previousAssigneeMembershipId,
    ...(input.reason === null ? {} : { reason: input.reason }),
    sessionId: input.task.valet_session_id,
    toStatus: input.toStatus,
    toVersion: input.toVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Task', $7, $8::jsonb, $9)`,
    [
      id,
      input.task.organization_id,
      input.task.location_id,
      input.task.valet_session_id,
      input.actorMembershipId,
      input.eventType,
      input.task.id,
      JSON.stringify(metadata),
      input.occurredAt,
    ],
  );
  return id;
}
