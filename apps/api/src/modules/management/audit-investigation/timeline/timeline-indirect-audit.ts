import type { PostgresTransaction } from "../../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management-authorization";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

/** Independently prove an indirect Audit record's canonical persisted link.
 * Only NULL-direct rows qualify. Wrong direct Session, cross-scope Task or
 * Incident, Vehicle-only relation and malformed parked Task are denied.
 */
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
  AND (
    (audit.entity_type IN ('ValetSession', 'VALET_SESSION')
      AND audit.entity_id = session.id)
    OR (audit.entity_type = 'Task' AND EXISTS (
      SELECT 1 FROM tasks AS task
      WHERE task.organization_id = session.organization_id
        AND task.location_id = session.location_id
        AND task.valet_session_id = session.id
        AND task.id = audit.entity_id
    ))
    OR (audit.entity_type = 'INCIDENT' AND EXISTS (
      SELECT 1 FROM incidents AS incident
      WHERE incident.organization_id = session.organization_id
        AND incident.location_id = session.location_id
        AND incident.valet_session_id = session.id
        AND incident.id = audit.entity_id
    ))
  )
  AND (
    audit.event_type <> 'VALET_SESSION_PARKED'
    OR audit.metadata_json->>'taskId' IS NULL
    OR EXISTS (
      SELECT 1 FROM tasks AS parked_task
      WHERE parked_task.organization_id = session.organization_id
        AND parked_task.location_id = session.location_id
        AND parked_task.valet_session_id = session.id
        AND parked_task.id::text = audit.metadata_json->>'taskId'
    )
  )
FOR SHARE OF session, audit`;

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
