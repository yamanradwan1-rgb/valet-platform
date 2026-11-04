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

interface ReadyRow {
  readonly sourceId: string;
  readonly episodeId: string;
  readonly occurredAt: Date;
}

async function fetchReadyCases(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput,
  exactId?: string,
): Promise<RetrievalPhaseAlertCase[]> {
  validateRetrievalPhaseAlertInput(input);
  if (exactId !== undefined) requireManagementAlertSourceId(exactId);
  const scope = await requireManagementAlertSourceScope(tx, input);
  // The append-only VALET_SESSION_READY Audit ID identifies this committed
  // transition. No timestamp or random UUID is used as a sequence tie breaker.
  // Multiple READY events, including a later same-millisecond correction,
  // fail closed until a canonical correction/episode contract is accepted.
  const rows = await tx.query<ReadyRow>(
    `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at),
     candidate AS (
       SELECT session.id, session.organization_id, session.location_id,
              session.state, session.ready_at, session.handoff_pending_at,
              task.id AS task_id
       FROM valet_sessions AS session
       JOIN tasks AS task
         ON task.organization_id=session.organization_id
        AND task.location_id=session.location_id
        AND task.valet_session_id=session.id
       JOIN retrieval_requests AS request
         ON request.organization_id=session.organization_id
        AND request.valet_session_id=session.id
       WHERE session.organization_id=$1 AND session.location_id=$2
         AND session.state IN ('READY', 'HANDOFF_PENDING')
         AND session.ready_at IS NOT NULL
         AND session.retrieval_started_at IS NOT NULL
         AND session.ready_at >= session.retrieval_started_at
         AND session.ready_at > $5::timestamptz
         AND ((session.state='READY' AND session.handoff_pending_at IS NULL)
           OR (session.state='HANDOFF_PENDING'
             AND session.handoff_pending_at >= session.ready_at))
         AND task.task_type='RETRIEVAL' AND task.status='IN_PROGRESS'
         AND task.current_assignee_membership_id IS NOT NULL
         AND request.status='ACCEPTED'
         AND request.requested_at=session.retrieval_requested_at
         AND ($6::uuid IS NULL OR session.id=$6::uuid)
     ),
     proven AS (
       SELECT candidate.*, proof.episode_id
       FROM candidate
       JOIN LATERAL (
         SELECT count(*)::integer AS total,
           count(*) FILTER (WHERE
             audit.occurred_at=candidate.ready_at
             AND audit.entity_type='VALET_SESSION'
             AND audit.entity_id=candidate.id
             AND audit.actor_membership_id IS NOT NULL
             AND audit.metadata_json->>'fromState'='RETRIEVING'
             AND audit.metadata_json->>'toState'='READY'
             AND audit.metadata_json->>'taskId'=candidate.task_id::text
             AND jsonb_typeof(audit.metadata_json->'toVersion')='number'
             AND jsonb_typeof(audit.metadata_json->'fromVersion')='number'
             AND (audit.metadata_json->>'fromVersion')::text =
                 ((audit.metadata_json->>'toVersion')::integer-1)::text
           )::integer AS valid,
           min(audit.id::text) AS episode_id
         FROM audit_events AS audit
         WHERE audit.organization_id=candidate.organization_id
           AND audit.location_id=candidate.location_id
           AND audit.valet_session_id=candidate.id
           AND audit.event_type='VALET_SESSION_READY'
       ) AS proof ON proof.total=1 AND proof.valid=1
     )
     SELECT proven.id::text AS "sourceId",
            proven.episode_id AS "episodeId",
            proven.ready_at AS "occurredAt"
     FROM proven CROSS JOIN instant
     WHERE instant.at > proven.ready_at + $3::integer * interval '1 second'
     ORDER BY proven.ready_at DESC, proven.id DESC LIMIT $4`,
    [scope.organizationId, scope.locationId, input.delaySeconds,
      input.limit, input.postLockClockCutover, exactId ?? null],
  );
  return rows.rows.map((row) => ({
    category: "ALT-06", severity: "IMPORTANT", sourceKind: "RETRIEVAL",
    sourceId: row.sourceId, episodeId: row.episodeId,
    organizationId: scope.organizationId, locationId: scope.locationId,
    occurredAt: row.occurredAt.toISOString(),
    title: "Vehicle ready for handoff",
  }));
}

/** No Seen writes, transport, or newly authorized Management categories. */
export function queryRetrievalReadyAlertCases(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput,
): Promise<RetrievalPhaseAlertCase[]> {
  return fetchReadyCases(tx, input);
}

export async function findRetrievalReadyAlertCaseById(
  tx: PostgresTransaction,
  input: RetrievalPhaseAlertInput,
  sessionId: string,
  expectedEpisodeId: string,
): Promise<RetrievalPhaseAlertCase | null> {
  const [candidate] = await fetchReadyCases(tx, { ...input, limit: 1 }, sessionId);
  return candidate?.episodeId === expectedEpisodeId ? candidate : null;
}
