import type {
  AuditInvestigationFilterQuery,
  AuditInvestigationFilterResponse,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";

interface SelectorRow {
  readonly id: string;
  readonly label: string | null;
}

/** Literal prefix only; never let '%'/'_' become arbitrary wildcard scans. */
export function escapeSelectorPrefix(value: string | undefined): string | null {
  return value === undefined
    ? null
    : value.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%";
}

const slotSql = `
SELECT slot.id::text AS id, slot.code AS label
  FROM key_slots slot
 WHERE slot.organization_id = $1::uuid AND slot.location_id = $2::uuid
   AND ($3::text IS NULL OR lower(slot.code) LIKE $3::text ESCAPE '\\')
 ORDER BY slot.code COLLATE "C", slot.id
 LIMIT $4::integer`;

/** Shared by selector discovery AND point-ID containment validation. */
export const locationMemberParticipationSql = `(
     EXISTS (SELECT 1 FROM key_custody_events k
       WHERE k.organization_id = $1::uuid AND k.location_id = $2::uuid
         AND k.actor_membership_id = member.id)
     OR EXISTS (SELECT 1 FROM dispatch_events d
       WHERE d.organization_id = $1::uuid AND d.location_id = $2::uuid
         AND member.id IN (d.actor_membership_id, d.previous_assignee_membership_id,
                           d.new_assignee_membership_id))
     OR EXISTS (SELECT 1 FROM audit_events a
       WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
         AND a.actor_membership_id = member.id
         AND (a.actor_type IS NULL OR a.actor_type = 'MEMBERSHIP'))
     OR EXISTS (SELECT 1 FROM incidents i
       INNER JOIN locations location ON location.id = $2::uuid
         AND location.organization_id = $1::uuid AND location.status = 'ACTIVE'
       WHERE i.organization_id = $1::uuid AND i.location_id = $2::uuid
         AND i.reported_by_membership_id = member.id)
)`;

const memberSql = `
SELECT member.id::text AS id,
       NULLIF(trim(concat_ws(' ', member.first_name, member.last_name)), '') AS label
  FROM organization_memberships member
 WHERE member.organization_id = $1::uuid
   AND ($3::text IS NULL OR lower(concat_ws(' ', member.first_name, member.last_name))
        LIKE $3::text ESCAPE '\\')
   AND ${locationMemberParticipationSql}
 ORDER BY coalesce(member.first_name, '') COLLATE "C",
          coalesce(member.last_name, '') COLLATE "C", member.id
 LIMIT $4::integer`;

export async function listAuditInvestigationFilterOptions(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: AuditInvestigationFilterQuery,
): Promise<AuditInvestigationFilterResponse> {
  const result = await transaction.query<SelectorRow>(
    query.kind === "KEY_SLOT" ? slotSql : memberSql,
    [scope.organizationId, scope.locationId, escapeSelectorPrefix(query.text), query.limit + 1],
  );
  const hasMore = result.rows.length > query.limit;
  return {
    kind: query.kind,
    items: result.rows.slice(0, query.limit).map((row) => {
      const label = typeof row.label === "string" && row.label.trim() === row.label &&
        row.label.length > 0 && row.label.length <= 201 && !/\p{Cc}/u.test(row.label)
        ? row.label : null;
      return {
        id: row.id,
        currentLabel: { value: label, basis: "CURRENT", unavailable: label === null },
      };
    }),
    nextCursor: null,
    // No unproven mutable-directory pagination. UI must refine prefix.
    hasMore,
  };
}

export const auditInvestigationSelectorStatements = { slotSql, memberSql };
