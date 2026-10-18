import type { PostgresTransaction } from "../../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management-authorization";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

/** Only the Audit source's own immutable Session entity can anchor NULL-direct
 * evidence. The canonical Task/Incident/PARKED writers always set direct
 * Session IDs; present-day parent existence or XID order is insufficient. */
export const indirectAuditContainmentSql = `
SELECT 1
FROM valet_sessions AS session
JOIN audit_events AS audit
  ON audit.organization_id = session.organization_id
 AND audit.location_id = session.location_id
 AND audit.id = $4::uuid
 AND audit.valet_session_id IS NULL
WHERE session.organization_id = $1::uuid
  AND session.location_id = $2::uuid
  AND session.id = $3::uuid
  AND audit.entity_type IN ('ValetSession', 'VALET_SESSION')
  AND audit.entity_id = session.id
  AND (
    audit.event_type <> 'VALET_SESSION_PARKED'
    OR NOT (audit.metadata_json ? 'taskId')
    OR (jsonb_typeof(audit.metadata_json->'taskId') = 'string' AND EXISTS (
      SELECT 1 FROM tasks AS parked_task
      WHERE parked_task.organization_id = session.organization_id
        AND parked_task.location_id = session.location_id
        AND parked_task.valet_session_id = session.id
        AND parked_task.task_type = 'PARKING'
        AND parked_task.id::text = audit.metadata_json->>'taskId'
    ))
  )
FOR SHARE OF session`;

export async function requireIndirectAuditSessionContainment(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
  eventId: string,
): Promise<void> {
  const result = await tx.query(indirectAuditContainmentSql, [
    scope.organizationId,
    scope.locationId,
    sessionId,
    eventId,
  ]);
  if (result.rowCount !== 1) throw new ManagementAccessDeniedError();
}

/** Anomaly visibility needs an independent persisted direct Session anchor.
 * Indirect-only conflicts can be reported at Location-level by Search, but
 * must never expose an inferred Session relationship via this detail view. */
export async function hasAnchoredTimelineAuditAnomaly(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  sessionId: string,
  snapshot: { readonly database: string; readonly now: Date },
): Promise<boolean> {
  const result = await tx.query<{ readonly anomalous: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM valet_sessions AS session
      JOIN audit_events AS audit
        ON audit.organization_id = session.organization_id
       AND audit.location_id = session.location_id
       AND audit.valet_session_id = session.id
      WHERE session.organization_id = $1::uuid
        AND session.location_id = $2::uuid
        AND session.id = $3::uuid
        AND (audit.pagination_birth_xid IS NULL OR
          pg_visible_in_snapshot(audit.pagination_birth_xid, $4::pg_snapshot))
        AND audit.created_at <= $5::timestamptz
        AND (
          (audit.entity_type IN ('ValetSession', 'VALET_SESSION')
            AND audit.entity_id IS DISTINCT FROM session.id)
          OR (audit.entity_type IN ('Vehicle', 'VEHICLE')
            AND audit.entity_id IS DISTINCT FROM session.vehicle_id)
          OR (audit.entity_type IN ('Task', 'TASK')
            AND audit.metadata_json ? 'sessionId'
            AND audit.metadata_json->>'sessionId' IS DISTINCT FROM session.id::text)
          OR (audit.entity_type IN ('Task', 'TASK') AND EXISTS (
            SELECT 1 FROM tasks AS task WHERE task.id = audit.entity_id
              AND task.organization_id = session.organization_id
              AND task.location_id = session.location_id
              AND task.valet_session_id IS DISTINCT FROM session.id
              AND task.pagination_birth_xid IS NOT NULL
              AND pg_visible_in_snapshot(task.pagination_birth_xid, $4::pg_snapshot)
              AND task.created_at <= $5::timestamptz))
          OR (audit.entity_type IN ('Incident', 'INCIDENT') AND EXISTS (
            SELECT 1 FROM incidents AS incident WHERE incident.id = audit.entity_id
              AND incident.organization_id = session.organization_id
              AND incident.location_id = session.location_id
              AND incident.valet_session_id IS DISTINCT FROM session.id
              AND incident.pagination_birth_xid IS NOT NULL
              AND pg_visible_in_snapshot(incident.pagination_birth_xid, $4::pg_snapshot)
              AND incident.created_at <= $5::timestamptz))
          OR (audit.event_type = 'VALET_SESSION_PARKED' AND (
            audit.entity_type NOT IN ('ValetSession', 'VALET_SESSION', 'Task', 'TASK')
            OR (audit.metadata_json ? 'taskId'
                AND jsonb_typeof(audit.metadata_json->'taskId') IS DISTINCT FROM 'string')
            OR (audit.metadata_json ? 'taskId' AND EXISTS (
              SELECT 1 FROM tasks AS task
              WHERE task.organization_id = session.organization_id
                AND task.location_id = session.location_id
                AND task.id::text = audit.metadata_json->>'taskId'
                AND (task.valet_session_id IS DISTINCT FROM session.id
                     OR task.task_type <> 'PARKING')
                AND task.pagination_birth_xid IS NOT NULL
                AND pg_visible_in_snapshot(task.pagination_birth_xid, $4::pg_snapshot)
                AND task.created_at <= $5::timestamptz))
            OR (audit.entity_type IN ('Task', 'TASK')
                AND audit.metadata_json ? 'taskId'
                AND audit.entity_id::text IS DISTINCT FROM audit.metadata_json->>'taskId')
          ))
        )
    ) AS anomalous`, [scope.organizationId, scope.locationId, sessionId,
      snapshot.database, snapshot.now]);
  return result.rows[0]?.anomalous === true;
}
