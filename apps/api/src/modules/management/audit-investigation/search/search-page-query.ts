import type {
  AuditInvestigationMatchReason,
  AuditInvestigationSearchItem,
  AuditInvestigationSearchQuery,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";
import { managementAuditKnownEventTypes } from "../../management-audit-event-catalog";
import { searchWitnessSql } from "./search-witness-sql";
export {
  auditInvestigationIntegritySql,
  queryAuditInvestigationLocationIntegrity,
} from "./search-integrity";

interface SearchRow {
  readonly sessionId: string;
  readonly firstMatchedAt: Date;
  readonly lastMatchedAt: Date;
  /** Full PostgreSQL precision for keyset comparison, never a JS Date. */
  readonly lastMatchedAtCursor: string;
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
  readonly cutoff: string;
}

export interface NormalizedSearch {
  readonly makePrefix: string | null;
  readonly modelPrefix: string | null;
  readonly plateCountry: string | null;
  readonly plate: string | null;
}

const querySql = `${searchWitnessSql},
reason_rows AS MATERIALIZED (
  SELECT matched.session_id, matched.occurred_at, matched.id, reason.kind,
         row_number() OVER (PARTITION BY matched.session_id, reason.kind
           ORDER BY matched.occurred_at, matched.id) AS category_row,
         jsonb_strip_nulls(jsonb_build_object(
           'source', matched.source, 'eventId', matched.id,
           'matchedBy', reason.kind, 'participationRole',
             CASE WHEN reason.kind = 'EMPLOYEE' THEN matched.employee_role END
         )) AS reason
  FROM matched
  CROSS JOIN LATERAL (
    SELECT 'KEY_SLOT'::text AS kind WHERE matched.key_match
    UNION ALL SELECT 'EMPLOYEE' WHERE matched.employee_role IS NOT NULL
    UNION ALL SELECT 'WINDOW' WHERE $5::uuid IS NULL AND $6::uuid IS NULL
  ) reason
),
reason_aggregates AS MATERIALIZED (
  SELECT reasons.session_id,
         jsonb_agg(reasons.reason ORDER BY reasons.occurred_at,
           reasons.id, reasons.kind) FILTER (
             WHERE reasons.category_row <= CASE
               WHEN $5::uuid IS NOT NULL AND $6::uuid IS NOT NULL THEN 50
               ELSE 100 END
           ) AS reasons
    FROM reason_rows AS reasons
   GROUP BY reasons.session_id
)
SELECT session.id::text AS "sessionId", summary.first_at AS "firstMatchedAt",
       summary.last_at AS "lastMatchedAt",
       to_char(summary.last_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "lastMatchedAtCursor",
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
           AND (incident.pagination_birth_xid IS NULL OR
             pg_visible_in_snapshot(incident.pagination_birth_xid, $10::pg_snapshot))
       )) AS "hasVisibleIncident",
       COALESCE(reason_aggregates.reasons, '[]'::jsonb) AS reasons
  FROM summary
  LEFT JOIN reason_aggregates
    ON reason_aggregates.session_id = summary.session_id
  JOIN valet_sessions session ON session.organization_id = $1::uuid
    AND session.location_id = $2::uuid AND session.id = summary.session_id
    AND (session.pagination_birth_xid IS NULL OR
      pg_visible_in_snapshot(session.pagination_birth_xid, $10::pg_snapshot))
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
   AND ($16::timestamptz IS NULL OR
      (summary.last_at, session.id) < ($16::timestamptz, $17::uuid))
 ORDER BY summary.last_at DESC, session.id DESC
 LIMIT $11::integer`;

export async function queryAuditInvestigationFirstPage(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: AuditInvestigationSearchQuery,
  normalized: NormalizedSearch,
  snapshot: SearchSnapshot,
  after?: { readonly lastMatchedAt: string; readonly sessionId: string },
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
    snapshot.cutoff,
    snapshot.database,
    query.limit + 1,
    normalized.plateCountry,
    normalized.plate,
    query.sessionId ?? null,
    managementAuditKnownEventTypes,
    after?.lastMatchedAt ?? null,
    after?.sessionId ?? null,
  ]);
  return result.rows;
}

function safeLabel(value: string | null): {
  value: string | null;
  basis: "CURRENT";
  unavailable: boolean;
} {
  const valid =
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 201 &&
    !/\p{Cc}/u.test(value);
  const safe = valid ? value : null;
  return { value: safe, basis: "CURRENT", unavailable: safe === null };
}

export function projectAuditInvestigationSearchItem(
  row: SearchRow,
): AuditInvestigationSearchItem {
  const status = row.incidentAvailable ? "AVAILABLE" : "NOT_AUTHORIZED";
  const available = { status: "AVAILABLE" as const };
  const coverage = {
    AUDIT: available,
    KEY_CUSTODY: available,
    DISPATCH: available,
    INCIDENT:
      status === "AVAILABLE"
        ? available
        : {
            status: "NOT_AUTHORIZED" as const,
            reason: "DETAIL_RESTRICTED" as const,
          },
  };
  return {
    sessionId: row.sessionId,
    currentVehicle: {
      make: safeLabel(row.make),
      model: safeLabel(row.model),
      plate: safeLabel(row.plate),
      plateCountry: safeLabel(row.plateCountry),
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
