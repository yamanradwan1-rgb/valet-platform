import type { PostgresTransaction } from "../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "./security/audit-investigation-authorization";

/** A signed pg_snapshot does NOT freeze an Audit row's indirect Task/Incident
 * Session relationship. Neither Task nor its key columns have an approved
 * database-owned birth/revision epoch, so a parent inserted/relinked after S0
 * could make an OLD Audit row qualify only on page 2. Fail closed even if the
 * old Audit row currently has no resolvable Session relationship. This check
 * intentionally spans the whole Location for Timeline (the missing Session
 * relationship cannot safely be scoped to a Session before it is resolved).
 */
export async function requireU05StableIndirectCohort(
  tx: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  snapshot: { readonly now: Date; readonly database: string },
  window?: { readonly from: string; readonly to: string },
): Promise<void> {
  const result = await tx.query<{ readonly unsafe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM audit_events AS a
       WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
         AND a.created_at <= $3::timestamptz
         AND (a.pagination_birth_xid IS NULL OR
           pg_visible_in_snapshot(a.pagination_birth_xid, $4::pg_snapshot))
         AND ($5::timestamptz IS NULL OR a.occurred_at >= $5::timestamptz)
         AND ($6::timestamptz IS NULL OR a.occurred_at < $6::timestamptz)
         AND (a.entity_type IN ('Task','TASK','Incident','INCIDENT',
                               'Vehicle','VEHICLE')
           OR (a.event_type = 'VALET_SESSION_PARKED'
             AND a.metadata_json ? 'taskId'))
     ) AS unsafe`,
    [scope.organizationId, scope.locationId, snapshot.now,
      snapshot.database, window?.from ?? null, window?.to ?? null],
  );
  // No database denial or transient error is converted to "safe".
  if (result.rowCount !== 1 || result.rows[0]?.unsafe !== false) {
    throw new U05IndirectCohortNotStable();
  }
}

export class U05IndirectCohortNotStable extends Error {
  constructor() {
    super("U05_INDIRECT_TASK_INCIDENT_COHORT_UNPROVEN");
  }
}
