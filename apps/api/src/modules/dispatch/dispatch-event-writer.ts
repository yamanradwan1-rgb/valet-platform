import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

interface DispatchEventTaskScope {
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly valet_session_id: string;
}

export type Val005eDispatchEventType =
  | "QUEUED"
  | "ASSIGNED"
  | "ACCEPTED"
  | "DECLINED"
  | "REASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export async function appendDispatchEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string | null;
    readonly eventType: Val005eDispatchEventType;
    readonly newAssigneeMembershipId: string | null;
    readonly occurredAt: Date;
    readonly previousAssigneeMembershipId: string | null;
    readonly reason: string | null;
    readonly task: DispatchEventTaskScope;
  },
  eventIdFactory: () => string = randomUUID,
): Promise<string> {
  const eventId = eventIdFactory();
  await transaction.query(
    `INSERT INTO dispatch_events
       (id, organization_id, location_id, task_id, valet_session_id,
        event_type, actor_membership_id, previous_assignee_membership_id,
        new_assignee_membership_id, reason, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      eventId,
      input.task.organization_id,
      input.task.location_id,
      input.task.id,
      input.task.valet_session_id,
      input.eventType,
      input.actorMembershipId,
      input.previousAssigneeMembershipId,
      input.newAssigneeMembershipId,
      input.reason,
      input.occurredAt,
    ],
  );
  return eventId;
}
