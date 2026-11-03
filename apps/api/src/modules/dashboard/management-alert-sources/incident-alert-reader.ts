import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  requireManagementAlertSourceId,
  requireManagementAlertSourceScope,
  type ManagementAlertExactReaderInput,
  type ManagementAlertReaderInput,
  type ManagementAlertSourceCase,
} from "./management-alert-source-contract";

interface IncidentAlertRow {
  readonly incidentId: string;
  readonly severity: "HIGH" | "CRITICAL";
  readonly createdAt: Date;
}

async function sourceCandidates(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
  sourceId?: string,
): Promise<ManagementAlertSourceCase[]> {
  const scope = await requireManagementAlertSourceScope(transaction, input);
  const exactPredicate =
    sourceId === undefined ? "" : "AND incident.id=$4::uuid";
  const rows = await transaction.query<IncidentAlertRow>(
    `SELECT incident.id::text AS "incidentId",
            incident.severity::text AS severity,
            incident.created_at AS "createdAt"
     FROM incidents AS incident
     WHERE incident.organization_id = $1
       AND incident.location_id = $2
       AND incident.status IN ('OPEN', 'INVESTIGATING')
       AND incident.severity IN ('HIGH', 'CRITICAL')
       ${exactPredicate}
     ORDER BY CASE WHEN incident.severity='CRITICAL' THEN 0 ELSE 1 END,
       incident.created_at DESC, incident.id DESC
     LIMIT $3`,
    [
      scope.organizationId,
      scope.locationId,
      input.limit,
      ...(sourceId === undefined ? [] : [sourceId]),
    ],
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

/** ALT-08: filter both persisted status and severity before any source LIMIT. */
export async function queryIncidentAlertCases(
  transaction: PostgresTransaction,
  input: ManagementAlertReaderInput,
): Promise<ManagementAlertSourceCase[]> {
  return sourceCandidates(transaction, input);
}

/** Source ID is checked inside the authorized eligibility query, not a page. */
export async function findIncidentAlertCaseById(
  transaction: PostgresTransaction,
  input: ManagementAlertExactReaderInput,
): Promise<ManagementAlertSourceCase | null> {
  requireManagementAlertSourceId(input.sourceId);
  return (
    (
      await sourceCandidates(
        transaction,
        { context: input.context, scope: input.scope, limit: 1 },
        input.sourceId,
      )
    )[0] ?? null
  );
}
