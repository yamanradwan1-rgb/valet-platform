import type { AuditInvestigationSearchQuery } from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";
import type { SearchSnapshot } from "./search-page-query";

/** Generic scoped anomaly only; absent S0 parents are not automatically corrupt. */
export const auditInvestigationIntegritySql = `
SELECT EXISTS (
  SELECT 1 FROM audit_events a
  LEFT JOIN valet_sessions direct_session ON direct_session.id = a.valet_session_id
    AND direct_session.organization_id = $1::uuid
    AND direct_session.location_id = $2::uuid
    AND (direct_session.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(direct_session.pagination_birth_xid, $6::pg_snapshot))
  LEFT JOIN valet_sessions entity_session ON entity_session.id = a.entity_id
    AND a.entity_type IN ('ValetSession', 'VALET_SESSION')
    AND entity_session.organization_id = $1::uuid
    AND entity_session.location_id = $2::uuid
    AND (entity_session.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(entity_session.pagination_birth_xid, $6::pg_snapshot))
  LEFT JOIN tasks entity_task ON entity_task.id = a.entity_id
    AND a.entity_type IN ('Task', 'TASK')
    AND entity_task.organization_id = $1::uuid
    AND entity_task.location_id = $2::uuid
    AND (entity_task.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(entity_task.pagination_birth_xid, $6::pg_snapshot))
  LEFT JOIN incidents entity_incident ON entity_incident.id = a.entity_id
    AND a.entity_type IN ('Incident', 'INCIDENT')
    AND entity_incident.organization_id = $1::uuid
    AND entity_incident.location_id = $2::uuid
    AND (entity_incident.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(entity_incident.pagination_birth_xid, $6::pg_snapshot))
  LEFT JOIN tasks metadata_task ON metadata_task.id::text = a.metadata_json->>'taskId'
    AND a.event_type = 'VALET_SESSION_PARKED'
    AND metadata_task.organization_id = $1::uuid
    AND metadata_task.location_id = $2::uuid
    AND (metadata_task.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(metadata_task.pagination_birth_xid, $6::pg_snapshot))
  WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
    AND a.occurred_at >= $3::timestamptz AND a.occurred_at < $4::timestamptz
    AND a.created_at <= $5::timestamptz
    AND (a.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(a.pagination_birth_xid, $6::pg_snapshot))
    AND (
      -- Parent ownership never establishes a missing historical Audit Session.
      (a.valet_session_id IS NULL
        AND a.entity_type IN ('Task', 'TASK', 'Incident', 'INCIDENT'))
      OR
      -- Immutable conflicting IDs within Audit itself need no parent join.
      (a.valet_session_id IS NOT NULL
        AND a.entity_type IN ('ValetSession','VALET_SESSION')
        AND a.entity_id IS DISTINCT FROM a.valet_session_id)
      OR
      (direct_session.id IS NOT NULL AND (
        (a.entity_type IN ('ValetSession', 'VALET_SESSION')
          AND a.entity_id <> direct_session.id)
        OR (a.entity_type IN ('Vehicle', 'VEHICLE')
          AND a.entity_id <> direct_session.vehicle_id)
        OR (entity_task.id IS NOT NULL
          AND entity_task.valet_session_id <> direct_session.id)
        OR (entity_incident.id IS NOT NULL
          AND entity_incident.valet_session_id <> direct_session.id)
      ))
      OR (a.event_type = 'VALET_SESSION_PARKED' AND (
        (a.entity_type IS NULL OR
          a.entity_type NOT IN ('ValetSession','VALET_SESSION','Task','TASK'))
        OR (a.metadata_json ? 'taskId' AND (
          jsonb_typeof(a.metadata_json) IS DISTINCT FROM 'object'
          OR jsonb_typeof(a.metadata_json->'taskId') IS DISTINCT FROM 'string'
          OR a.metadata_json->>'taskId' !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        ))
        OR (entity_task.id IS NOT NULL AND entity_task.task_type <> 'PARKING')
        OR (metadata_task.id IS NOT NULL AND (
          metadata_task.task_type <> 'PARKING'
          OR (direct_session.id IS NOT NULL
            AND metadata_task.valet_session_id <> direct_session.id)
          OR (a.valet_session_id IS NOT NULL
            AND metadata_task.valet_session_id <> a.valet_session_id)
          OR (entity_session.id IS NOT NULL
            AND metadata_task.valet_session_id <> entity_session.id)
        ))
        OR (entity_task.id IS NOT NULL AND metadata_task.id IS NOT NULL
          AND entity_task.id <> metadata_task.id)
      ))
    )
) AS "hasAnomaly"`;

export async function queryAuditInvestigationLocationIntegrity(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: Pick<AuditInvestigationSearchQuery, "from" | "to">,
  snapshot: SearchSnapshot,
): Promise<boolean> {
  const result = await tx.query<{ hasAnomaly: boolean }>(
    auditInvestigationIntegritySql,
    [
      scope.organizationId,
      scope.locationId,
      query.from,
      query.to,
      snapshot.cutoff,
      snapshot.database,
    ],
  );
  return result.rows[0]?.hasAnomaly === true;
}
