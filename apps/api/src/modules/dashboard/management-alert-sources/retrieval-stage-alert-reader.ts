import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceId,
  requireManagementAlertSourceScope,
} from "./management-alert-source-contract";
import {
  validateRetrievalPhaseAlertInput,
  type RetrievalPhaseAlertCase,
  type RetrievalPhaseAlertInput,
} from "./retrieval-phase-alert-types";

interface StageRow {
  readonly sourceId: string;
  readonly episodeId: string;
  readonly occurredAt: Date;
}

async function fetchStageCases(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number },
  exactId?: string,
): Promise<RetrievalPhaseAlertCase[]> {
  validateRetrievalPhaseAlertInput(input);
  if (exactId !== undefined) requireManagementAlertSourceId(exactId);
  // Revalidates Staff session, exact CA/LM Location grant, MFA and entitlement
  // before any Task, Dispatch, Retrieval or Audit row is selected.
  const scope = await requireManagementAlertSourceScope(tx, input);
  const rows = await tx.query<StageRow>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at),
     candidate AS (
       SELECT task.id, task.version, task.status, task.updated_at,
              task.organization_id, task.location_id, task.valet_session_id,
              task.current_assignee_membership_id, session.retrieval_started_at
       FROM tasks AS task
       JOIN valet_sessions AS session
         ON session.id=task.valet_session_id
        AND session.organization_id=task.organization_id
        AND session.location_id=task.location_id
       JOIN retrieval_requests AS request
         ON request.organization_id=session.organization_id
        AND request.valet_session_id=session.id
       CROSS JOIN instant
       WHERE task.organization_id=$1 AND task.location_id=$2
         AND task.task_type='RETRIEVAL'
         AND task.current_assignee_membership_id IS NOT NULL
         AND ((task.status='ACCEPTED' AND session.state='REQUESTED'
               AND request.status='OPEN')
              OR (task.status='IN_PROGRESS' AND session.state='RETRIEVING'
                  AND request.status='ACCEPTED'))
         AND request.requested_at=session.retrieval_requested_at
         AND ($7::uuid IS NULL OR task.id=$7::uuid)
         AND NOT (request.sla_target_seconds_snapshot IS NOT NULL
           AND instant.at > request.requested_at
             + (request.sla_target_seconds_snapshot + $6::integer)
               * interval '1 second')
     ),
     proven AS (
       SELECT task.*, proof.occurred_at,
              event_proof.matches
       FROM candidate AS task
       JOIN LATERAL (
         SELECT count(*)::integer AS total,
           count(*) FILTER (WHERE
             (task.status='ACCEPTED' AND audit.event_type='TASK_ACCEPTED'
               AND audit.entity_type='Task' AND audit.entity_id=task.id
               AND audit.metadata_json->>'fromStatus'='ASSIGNED'
               AND audit.metadata_json->>'toStatus'='ACCEPTED'
               AND jsonb_typeof(audit.metadata_json->'toVersion')='number'
               AND jsonb_typeof(audit.metadata_json->'fromVersion')='number'
               AND audit.metadata_json->>'fromVersion'=(task.version-1)::text
               AND audit.metadata_json->>'sessionId'=task.valet_session_id::text)
             OR (task.status='IN_PROGRESS'
               AND audit.event_type='VALET_SESSION_RETRIEVAL_STARTED'
               AND audit.entity_type='VALET_SESSION'
               AND audit.entity_id=task.valet_session_id
               AND audit.metadata_json->>'taskId'=task.id::text
               AND audit.metadata_json->>'fromTaskStatus'='ACCEPTED'
               AND audit.metadata_json->>'toTaskStatus'='IN_PROGRESS'
               AND jsonb_typeof(audit.metadata_json->'toTaskVersion')='number'
               AND jsonb_typeof(audit.metadata_json->'fromTaskVersion')='number'
               AND audit.metadata_json->>'fromTaskVersion'=(task.version-1)::text
               AND audit.metadata_json->>'toSessionState'='RETRIEVING'
               AND audit.occurred_at=task.retrieval_started_at)
           )::integer AS valid,
           min(audit.occurred_at) AS occurred_at,
           min(audit.actor_membership_id::text) AS actor_id
         FROM audit_events AS audit
         WHERE audit.organization_id=task.organization_id
           AND audit.location_id=task.location_id
           AND audit.valet_session_id=task.valet_session_id
           AND ( (task.status='ACCEPTED'
                  AND audit.metadata_json->>'toVersion'=task.version::text
                  AND audit.entity_type='Task' AND audit.entity_id=task.id)
                 OR (task.status='IN_PROGRESS'
                  AND audit.metadata_json->>'toTaskVersion'=task.version::text
                  AND audit.metadata_json->>'taskId'=task.id::text) )
       ) AS proof ON proof.total=1 AND proof.valid=1
       JOIN LATERAL (
         SELECT count(*)::integer AS matches
         FROM dispatch_events AS event
         WHERE event.organization_id=task.organization_id
           AND event.location_id=task.location_id
           AND event.valet_session_id=task.valet_session_id
           AND event.task_id=task.id
           AND event.event_type=task.status::text::dispatch_event_type
           AND event.occurred_at=proof.occurred_at
           AND event.actor_membership_id::text=proof.actor_id
           AND event.new_assignee_membership_id=
               task.current_assignee_membership_id
       ) AS event_proof ON event_proof.matches=1
       WHERE proof.actor_id IS NOT NULL
         AND proof.occurred_at=task.updated_at
         -- No version on DispatchEvent: even a matching same-ms actor/event
         -- could refer to a different historic entry. Until a durable
         -- per-event version link exists, only a singly entered stage is
         -- source-proven; re-entered stages fail closed.
         AND (SELECT count(*) FROM dispatch_events AS history
              WHERE history.organization_id=task.organization_id
                AND history.location_id=task.location_id
                AND history.task_id=task.id
                AND history.event_type=task.status::text::dispatch_event_type)=1
         AND (SELECT count(*) FROM audit_events AS history
              WHERE history.organization_id=task.organization_id
                AND history.location_id=task.location_id
                AND history.valet_session_id=task.valet_session_id
                AND history.event_type=CASE WHEN task.status='ACCEPTED'
                      THEN 'TASK_ACCEPTED'
                      ELSE 'VALET_SESSION_RETRIEVAL_STARTED' END
                AND (task.status='IN_PROGRESS'
                     OR (history.entity_type='Task' AND history.entity_id=task.id))
                AND (task.status='ACCEPTED'
                     OR history.metadata_json->>'taskId'=task.id::text))=1
     )
     SELECT proven.id::text AS "sourceId",
            proven.id::text || ':' || proven.version::text AS "episodeId",
            proven.occurred_at AS "occurredAt"
     FROM proven CROSS JOIN instant
     WHERE proven.occurred_at > $5::timestamptz
       AND instant.at > proven.occurred_at + $3::integer * interval '1 second'
     ORDER BY proven.occurred_at DESC, proven.id DESC LIMIT $4`,
    [scope.organizationId, scope.locationId, input.delaySeconds,
      input.limit, input.postLockClockCutover,
      input.alt01GraceSeconds, exactId ?? null],
  );
  return rows.rows.map((row) => ({
    category: "ALT-04", severity: "IMPORTANT", sourceKind: "TASK",
    sourceId: row.sourceId, episodeId: row.episodeId,
    organizationId: scope.organizationId, locationId: scope.locationId,
    occurredAt: row.occurredAt.toISOString(),
    title: "Retrieval task stage delayed",
  }));
}

/** Source-only P2 candidate; not wired into P1 preview or alert DTO. */
export function queryRetrievalStageAlertCases(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number },
): Promise<RetrievalPhaseAlertCase[]> {
  return fetchStageCases(tx, input);
}

export async function findRetrievalStageAlertCaseById(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput & { readonly alt01GraceSeconds: number },
  taskId: string,
  expectedEpisodeId: string,
): Promise<RetrievalPhaseAlertCase | null> {
  const [case_] = await fetchStageCases(tx, { ...input, limit: 1 }, taskId);
  return case_?.episodeId === expectedEpisodeId ? case_ : null;
}
