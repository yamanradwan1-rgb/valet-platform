import type { PostgresTransaction } from "../../common/database/postgres";

export interface ParkingAuditEvidence {
  readonly implicatedSessionId: string;
  readonly valetSessionId: string | null;
  readonly auditId: string;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly actorId: string | null;
  readonly entityType: string;
  readonly entityId: string;
  readonly occurredAt: Date;
  readonly metadata: unknown;
}

/**
 * DEC-103: Discover before validating. All three independently indexed paths
 * are restricted by Organization and the previously authorized session page.
 * A single physical Audit ID discovered more than once for the *same* page
 * session is one event; contradictory cross-session references remain visible
 * separately to every implicated page session.
 *
 * The two DEC-103 indexes remain an experimental deployment dependency.
 * Keep identifier dedup native UUID and Task-reference equality bytewise;
 * hydrate each discovered Audit by its unique primary key instead of a
 * planner-selected whole-Audit scan. Performance evidence is still required.
 */
export const parkingAuditDiscoverySql = `WITH page_parking_tasks AS MATERIALIZED (
       SELECT task.id::text COLLATE "C" AS "taskId",
              task.valet_session_id AS "sessionId"
       FROM tasks AS task
       WHERE task.organization_id = $1 AND task.location_id = $2
         AND task.valet_session_id = ANY($3::uuid[])
         AND task.task_type = 'PARKING'
     ),
     discovered AS (
       -- A: existing session-reference index. Do not require a valid Location
       -- yet: wrong-Location evidence must reach the fail-closed validator.
       SELECT audit.id AS "auditId",
              audit.valet_session_id AS "implicatedSessionId"
       FROM audit_events AS audit
       WHERE audit.organization_id = $1
         AND audit.event_type = 'VALET_SESSION_PARKED'
         AND audit.valet_session_id = ANY($3::uuid[])
       UNION ALL
       -- B: canonical entity reference, including NULL session linkage.
       SELECT audit.id AS "auditId",
              audit.entity_id AS "implicatedSessionId"
       FROM audit_events AS audit
       WHERE audit.organization_id = $1
         AND audit.event_type = 'VALET_SESSION_PARKED'
         AND audit.entity_id = ANY($3::uuid[])
       UNION ALL
       -- C: text comparison is safe even for malformed JSON taskId values.
       -- Restrict referenced Tasks by exact page Organization and Location.
       SELECT audit.id AS "auditId",
              task."sessionId" AS "implicatedSessionId"
       FROM page_parking_tasks AS task
       INNER JOIN audit_events AS audit
         ON audit.organization_id = $1
        AND audit.event_type = 'VALET_SESSION_PARKED'
        AND (audit.metadata_json->>'taskId') COLLATE "C" = task."taskId"
     ),
     unique_discoveries AS (
       SELECT DISTINCT "auditId", "implicatedSessionId" FROM discovered
     )
     SELECT discovery."implicatedSessionId",
            audit.valet_session_id::text AS "valetSessionId",
            audit.id::text AS "auditId",
            audit.organization_id::text AS "organizationId",
            audit.location_id::text AS "locationId",
            audit.actor_membership_id::text AS "actorId",
            audit.entity_type AS "entityType",
            audit.entity_id::text AS "entityId",
            audit.occurred_at AS "occurredAt",
            audit.metadata_json AS metadata
     FROM unique_discoveries AS discovery
     -- Audit ID is a PRIMARY KEY. LIMIT 1 bounds a single-ID lookup only;
     -- it never caps candidates or suppresses contradictory discoveries.
     CROSS JOIN LATERAL (
       SELECT evidence.* FROM audit_events AS evidence
       WHERE evidence.id = discovery."auditId"
       LIMIT 1
     ) AS audit
     ORDER BY discovery."implicatedSessionId", audit.id`;

export async function discoverParkingAuditEvidence(
  transaction: PostgresTransaction,
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly sessionIds: readonly string[];
  },
): Promise<readonly ParkingAuditEvidence[]> {
  if (input.sessionIds.length === 0) return [];
  const query = await transaction.query<ParkingAuditEvidence>(
    parkingAuditDiscoverySql,
    [input.organizationId, input.locationId, input.sessionIds],
  );
  return query.rows;
}
