import type { ReportIncidentResponse } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";

export interface IncidentRecoveryIntentRow {
  readonly expires_at: Date;
  readonly incident_id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly reporting_membership_id: string;
  readonly state: "RESERVED" | "RETIRED";
  readonly valet_session_id: string;
}

export interface RecoveryIncidentRow {
  readonly created_at: Date;
  readonly id: string;
  readonly reported_by_membership_id: string;
  readonly severity: ReportIncidentResponse["severity"];
  readonly status: "OPEN";
  readonly type: ReportIncidentResponse["type"];
  readonly valet_session_id: string;
}

export async function loadRecoveryIntent(
  transaction: PostgresTransaction,
  organizationId: string,
  incidentId: string,
): Promise<IncidentRecoveryIntentRow | undefined> {
  const result = await transaction.query<IncidentRecoveryIntentRow>(
    `SELECT incident_id::text, organization_id::text, location_id::text,
            valet_session_id::text, reporting_membership_id::text,
            state::text, expires_at
     FROM incident_recovery_intents
     WHERE organization_id = $1 AND incident_id = $2`,
    [organizationId, incidentId],
  );
  return result.rows[0];
}

export async function loadRecoveryIncident(
  transaction: PostgresTransaction,
  organizationId: string,
  incidentId: string,
): Promise<RecoveryIncidentRow | undefined> {
  const result = await transaction.query<RecoveryIncidentRow>(
    `SELECT id::text, created_at, reported_by_membership_id::text,
            status::text, type, severity::text,
            valet_session_id::text
     FROM incidents
     WHERE id = $1 AND organization_id = $2`,
    [incidentId, organizationId],
  );
  return result.rows[0];
}

export function incidentReport(
  row: RecoveryIncidentRow,
): ReportIncidentResponse {
  return {
    createdAt: row.created_at.toISOString(),
    incidentId: row.id,
    reportedByMembershipId: row.reported_by_membership_id,
    sessionId: row.valet_session_id,
    severity: row.severity,
    status: "OPEN",
    type: row.type,
  };
}
