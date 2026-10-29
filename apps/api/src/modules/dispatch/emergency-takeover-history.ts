import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  LockedEmergencySession,
  LockedEmergencyTask,
} from "./emergency-takeover-types";

export async function appendEmergencyTakeoverHistory(
  tx: PostgresTransaction,
  input: {
    readonly session: LockedEmergencySession;
    readonly task: LockedEmergencyTask;
    readonly actorMembershipId: string;
    readonly newAssigneeMembershipId: string;
    readonly reason: string;
    readonly operationId: string;
    readonly operationTime: Date;
  },
): Promise<{
  readonly dispatchEventId: string;
  readonly auditEventId: string;
}> {
  const dispatchEventId = randomUUID();
  const auditEventId = randomUUID();
  await tx.query(
    `INSERT INTO dispatch_events
       (id, organization_id, location_id, task_id, valet_session_id,
        event_type, actor_membership_id, previous_assignee_membership_id,
        new_assignee_membership_id, reason, occurred_at)
     VALUES ($1,$2,$3,$4,$5,'EMERGENCY_TAKEOVER',$6,$7,$8,$9,$10)`,
    [
      dispatchEventId,
      input.session.organization_id,
      input.session.location_id,
      input.task.id,
      input.session.id,
      input.actorMembershipId,
      input.task.current_assignee_membership_id,
      input.newAssigneeMembershipId,
      input.reason,
      input.operationTime,
    ],
  );
  const metadata = {
    operationId: input.operationId,
    previousAssigneeMembershipId: input.task.current_assignee_membership_id,
    newAssigneeMembershipId: input.newAssigneeMembershipId,
    reason: input.reason,
    sessionId: input.session.id,
    fromStatus: "IN_PROGRESS",
    toStatus: "IN_PROGRESS",
    fromVersion: input.task.version,
    toVersion: input.task.version + 1,
    fromSessionVersion: input.session.version,
    toSessionVersion: input.session.version + 1,
  };
  await tx.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1,$2,$3,$4,$5,'TASK_EMERGENCY_TAKEOVER','Task',$6,$7::jsonb,$8)`,
    [
      auditEventId,
      input.session.organization_id,
      input.session.location_id,
      input.session.id,
      input.actorMembershipId,
      input.task.id,
      JSON.stringify(metadata),
      input.operationTime,
    ],
  );
  return { dispatchEventId, auditEventId };
}
