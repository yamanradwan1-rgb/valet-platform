import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceScope,
  type ManagementAlertReaderInput,
  type ManagementAlertSourceCase,
} from "./management-alert-source-contract";

interface IncidentAlertRow {
  readonly incidentId: string;
  readonly severity: "HIGH" | "CRITICAL";
  readonly createdAt: Date;
}

/** ALT-08: filter both persisted status and severity before any source LIMIT. */
export async function queryIncidentAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<ManagementAlertSourceCase[]> {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const rows = await transaction.query<IncidentAlertRow>(
    `SELECT incident.id::text AS "incidentId",
            incident.severity::text AS severity,
            incident.created_at AS "createdAt"
     FROM incidents AS incident
     WHERE incident.organization_id = $1
       AND incident.location_id = $2
       AND incident.status IN ('OPEN', 'INVESTIGATING')
       AND incident.severity IN ('HIGH', 'CRITICAL')
     ORDER BY CASE WHEN incident.severity='CRITICAL' THEN 0 ELSE 1 END,
       incident.created_at DESC, incident.id DESC
     LIMIT $3`,
    [scope.organizationId, scope.locationId, input.limit],
  );
  return rows.rows.map((row) => ({
    category: "ALT-08",
    severity: row.severity === "CRITICAL" ? "CRITICAL" : "IMPORTANT",
    sourceKind: "INCIDENT",
    sourceId: row.incidentId,
    episodeId: row.incidentId,
    organizationId: scope.organizationId,
    locationId: scope.locationId,
    occurredAt: row.createdAt.toISOString(),
    title:
      row.severity === "CRITICAL" ? "Critical incident" : "Important incident",
  }));
}
