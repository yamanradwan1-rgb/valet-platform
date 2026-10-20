import type { PostgresTransaction } from "../../../../common/database/postgres";
import { ManagementAccessDeniedError } from "../../management-authorization";
import type {
  AuditInvestigationLocationAuthorization,
} from "./audit-investigation-authorization";

export type AuditInvestigationDetailSource =
  | "AUDIT"
  | "KEY_CUSTODY"
  | "DISPATCH"
  | "INCIDENT";

export interface AuditInvestigationDetailReference {
  readonly sessionId: string;
  readonly source: AuditInvestigationDetailSource;
  readonly eventId: string;
}

/** A trusted, fixed physical source table only; no user-provided SQL tokens. */
function fixedSourceTable(source: AuditInvestigationDetailSource): string {
  switch (source) {
    case "AUDIT":
      return "audit_events";
    case "KEY_CUSTODY":
      return "key_custody_events";
    case "DISPATCH":
      return "dispatch_events";
    case "INCIDENT":
      return "incidents";
    default:
      throw new ManagementAccessDeniedError();
  }
}

/**
 * Point-detail boundary. Call AFTER authorizeAuditInvestigationLocation in
 * the same request transaction; this query returns no evidence fields.
 *
 * Only DIRECT persisted Session evidence is proven here. Indirect Audit links
 * via Task/Incident/entity require a separately reviewed W3 scoped join.
 * Lock the proven Session only. Append-only evidence tables have SELECT but
 * no runtime UPDATE privilege, which PostgreSQL requires for FOR SHARE.
 * The final canonical detail reader rechecks its source in this transaction.
 * This function is not an authorization to read free-text, raw metadata,
 * private photo bytes, storage keys or Incident descriptions.
 *
 * An inactive Location may have authorized history, but INCIDENT details
 * cannot bypass the existing active-only Incident read boundary (DEC-059).
 */
export async function requireAuditInvestigationDetailSource(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  reference: AuditInvestigationDetailReference,
): Promise<void> {
  const table = fixedSourceTable(reference.source);
  const activeIncidentLocation =
    reference.source === "INCIDENT"
      ? `INNER JOIN locations AS location
           ON location.id = session.location_id
          AND location.organization_id = session.organization_id
          AND location.status = 'ACTIVE'`
      : "";

  const result = await transaction.query(
    `SELECT 1
     FROM valet_sessions AS session
     INNER JOIN ${table} AS evidence
       ON evidence.organization_id = session.organization_id
      AND evidence.location_id = session.location_id
      AND evidence.valet_session_id = session.id
     ${activeIncidentLocation}
     WHERE session.organization_id = $1
       AND session.location_id = $2
       AND session.id = $3
       AND evidence.id = $4
     FOR SHARE OF session`,
    [
      scope.organizationId,
      scope.locationId,
      reference.sessionId,
      reference.eventId,
    ],
  );
  if (result.rowCount !== 1) throw new ManagementAccessDeniedError();
}
