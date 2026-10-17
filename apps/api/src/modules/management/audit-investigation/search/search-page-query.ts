import type {
  AuditInvestigationMatchReason,
  AuditInvestigationSearchItem,
  AuditInvestigationSearchQuery,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";
import { searchWitnessSql } from "./search-witness-sql";

interface SearchRow {
  readonly sessionId: string;
  readonly firstMatchedAt: Date;
  readonly lastMatchedAt: Date;
  readonly matchingRecordCount: number;
  readonly matchedIncidentCount: number;
  readonly hasVisibleIncident: boolean;
  readonly incidentAvailable: boolean;
  readonly currentState: AuditInvestigationSearchItem["currentState"];
  readonly make: string | null;
  readonly model: string | null;
  readonly plate: string | null;
  readonly plateCountry: string | null;
  readonly temporaryDescriptor: string | null;
  readonly keySlotId: string | null;
  readonly slotCode: string | null;
  readonly reasons: AuditInvestigationMatchReason[];
}

export interface SearchSnapshot {
  readonly now: Date;
  readonly database: string;
}

export interface NormalizedSearch {
  readonly makePrefix: string | null;
  readonly modelPrefix: string | null;
  readonly plateCountry: string | null;
  readonly plate: string | null;
}

const querySql = `${searchWitnessSql}
SELECT session.id::text AS "sessionId", summary.first_at AS "firstMatchedAt",
       summary.last_at AS "lastMatchedAt",
       summary.record_count AS "matchingRecordCount",
       summary.incident_count AS "matchedIncidentCount",
       session.state::text AS "currentState",
       vehicle.make, vehicle.model, vehicle.plate_number_raw AS plate,
       vehicle.plate_country AS "plateCountry",
       vehicle.temporary_descriptor AS "temporaryDescriptor",
       session.key_slot_id::text AS "keySlotId", current_slot.code AS "slotCode",
       (location.status = 'ACTIVE') AS "incidentAvailable",
       (location.status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM incidents incident WHERE incident.organization_id = $1::uuid
           AND incident.location_id = $2::uuid AND incident.valet_session_id = session.id
           AND incident.created_at <= $9::timestamptz
       )) AS "hasVisibleIncident",
       COALESCE((
         SELECT jsonb_agg(reasons.reason ORDER BY reasons.occurred_at, reasons.id, reasons.kind)
         FROM (
           SELECT matched.occurred_at, matched.id, reason.kind,
                  row_number() OVER (
                    PARTITION BY reason.kind ORDER BY matched.occurred_at, matched.id
                  ) AS category_row,
                  jsonb_strip_nulls(jsonb_build_object(
                    'source', matched.source, 'eventId', matched.id,
                    'matchedBy', reason.kind, 'participationRole',
                     CASE WHEN reason.kind = 'EMPLOYEE' THEN matched.employee_role END
                  )) AS reason
           FROM matched
           CROSS JOIN LATERAL (
             SELECT 'KEY_SLOT'::text AS kind WHERE matched.key_match
             UNION ALL
             SELECT 'EMPLOYEE' WHERE matched.employee_role IS NOT NULL
             UNION ALL
             SELECT 'WINDOW' WHERE $5::uuid IS NULL AND $6::uuid IS NULL
           ) reason
           WHERE matched.session_id = session.id
         ) reasons
         WHERE reasons.category_row <= CASE
           WHEN $5::uuid IS NOT NULL AND $6::uuid IS NOT NULL THEN 50
           ELSE 100 END
       ), '[]'::jsonb) AS reasons
  FROM summary
  JOIN valet_sessions session ON session.organization_id = $1::uuid
    AND session.location_id = $2::uuid AND session.id = summary.session_id
  JOIN scoped_location location ON TRUE
  JOIN vehicles vehicle ON vehicle.organization_id = session.organization_id
    AND vehicle.id = session.vehicle_id
  LEFT JOIN key_slots current_slot ON current_slot.organization_id = $1::uuid
    AND current_slot.location_id = $2::uuid AND current_slot.id = session.key_slot_id
 WHERE ($7::text IS NULL OR lower(vehicle.make) LIKE $7::text ESCAPE '\\')
   AND ($8::text IS NULL OR lower(vehicle.model) LIKE $8::text ESCAPE '\\')
   AND ($12::text IS NULL OR vehicle.plate_country = $12::text)
   AND ($13::text IS NULL OR vehicle.plate_number_normalized = $13::text)
   AND ($14::uuid IS NULL OR session.id = $14::uuid)
 ORDER BY summary.last_at DESC, session.id DESC
 LIMIT $11::integer`;

export async function queryAuditInvestigationFirstPage(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: AuditInvestigationSearchQuery,
  normalized: NormalizedSearch,
  snapshot: SearchSnapshot,
): Promise<readonly SearchRow[]> {
  const result = await transaction.query<SearchRow>(querySql, [
    scope.organizationId,
    scope.locationId,
    query.from,
    query.to,
    query.keySlotId ?? null,
    query.membershipId ?? null,
    normalized.makePrefix,
    normalized.modelPrefix,
    snapshot.now,
    snapshot.database,
    query.limit + 1,
    normalized.plateCountry,
    normalized.plate,
    query.sessionId ?? null,
  ]);
  return result.rows;
}

function safeLabel(value: string | null): {
  value: string | null; basis: "CURRENT"; unavailable: boolean;
} {
  const valid = typeof value === "string" && value.trim() === value &&
    value.length > 0 && value.length <= 201 && !/\p{Cc}/u.test(value);
  const safe = valid ? value : null;
  return { value: safe, basis: "CURRENT", unavailable: safe === null };
}

export function projectAuditInvestigationSearchItem(row: SearchRow): AuditInvestigationSearchItem {
  const status = row.incidentAvailable ? "AVAILABLE" : "NOT_AUTHORIZED";
  const available = { status: "AVAILABLE" as const };
  const coverage = {
    AUDIT: available,
    KEY_CUSTODY: available,
    DISPATCH: available,
    INCIDENT: status === "AVAILABLE"
      ? available : { status: "NOT_AUTHORIZED" as const, reason: "DETAIL_RESTRICTED" as const },
  };
  return {
    sessionId: row.sessionId,
    currentVehicle: {
      make: safeLabel(row.make), model: safeLabel(row.model),
      plate: safeLabel(row.plate), plateCountry: safeLabel(row.plateCountry),
      temporaryDescriptor: safeLabel(row.temporaryDescriptor),
    },
    currentKeySlot: { keySlotId: row.keySlotId, code: safeLabel(row.slotCode) },
    currentState: row.currentState,
    currentStateBasis: "CURRENT",
    firstMatchedAt: row.firstMatchedAt.toISOString(),
    lastMatchedAt: row.lastMatchedAt.toISOString(),
    matchingRecordCount: row.matchingRecordCount,
    matchReasons: row.reasons,
    matchedIncidentCount: row.matchedIncidentCount,
    hasVisibleIncident: row.hasVisibleIncident,
    coverage,
  };
}

/** Exposed for SQL-only fixture/oracle tests; never interpolates input values. */
export const auditInvestigationFirstPageSql = querySql;
