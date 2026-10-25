import type { TaskOverviewEntry } from "@valet/contracts";
import { canonicalHistoryName } from "./operational-history-identity-projection";

export interface CancellationEvidence {
  count: number;
  actorId: string | null;
  firstName: string | null;
  lastName: string | null;
  guest: boolean;
  occurredAt: string | null;
}

// One exact event is required. Never pick an arbitrary "latest" actor from history.
export const taskCancellationColumn = `CASE WHEN task.status='CANCELLED' THEN (
  SELECT jsonb_build_object('count',count(*),'actorId',max(event.actor_membership_id::text),
    'firstName',max(actor.first_name),'lastName',max(actor.last_name),
    'occurredAt',min(event.occurred_at),'guest',bool_or(task.task_type='RETRIEVAL' AND event.actor_membership_id IS NULL AND EXISTS (
      SELECT 1 FROM audit_events a WHERE a.organization_id=task.organization_id
        AND a.location_id=task.location_id AND a.valet_session_id=task.valet_session_id
        AND a.event_type='RETRIEVAL_CANCELLED' AND a.actor_type='GUEST'
        AND a.metadata_json->>'task_id'=task.id::text AND a.occurred_at=event.occurred_at)))
  FROM dispatch_events event LEFT JOIN organization_memberships actor
    ON actor.organization_id=event.organization_id AND actor.id=event.actor_membership_id
  WHERE event.organization_id=task.organization_id AND event.location_id=task.location_id
    AND event.valet_session_id=task.valet_session_id AND event.task_id=task.id
    AND event.event_type='CANCELLED') ELSE NULL END AS "cancellationEvidence"`;

export function taskCancellationProjection(
  evidence: CancellationEvidence | null,
): TaskOverviewEntry["cancellation"] {
  if (evidence === null) return null;
  if (evidence.count !== 1)
    return { kind: "UNKNOWN", displayName: null, occurredAt: null };
  const name = canonicalHistoryName(evidence);
  return {
    kind:
      evidence.actorId !== null
        ? "STAFF"
        : evidence.guest
          ? "GUEST"
          : "UNKNOWN",
    displayName:
      evidence.actorId !== null && name !== null
        ? `${name.firstName} ${name.lastName}`
        : null,
    occurredAt:
      evidence.occurredAt === null
        ? null
        : new Date(evidence.occurredAt).toISOString(),
  };
}
