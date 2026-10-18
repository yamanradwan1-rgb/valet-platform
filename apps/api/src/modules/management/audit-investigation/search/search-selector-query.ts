import type {
  AuditInvestigationFilterQuery,
  AuditInvestigationFilterResponse,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../../../common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../security/audit-investigation-authorization";
import { managementAuditKnownEventTypes } from "../../management-audit-event-catalog";

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
       LEFT JOIN tasks task_ref ON task_ref.id = a.entity_id
         AND a.entity_type IN ('Task', 'TASK')
         AND task_ref.organization_id = $1::uuid
         AND task_ref.location_id = $2::uuid
       LEFT JOIN incidents incident_ref ON incident_ref.id = a.entity_id
         AND a.entity_type IN ('Incident', 'INCIDENT')
         AND incident_ref.organization_id = $1::uuid
         AND incident_ref.location_id = $2::uuid
       LEFT JOIN tasks parked_task ON parked_task.id::text = a.metadata_json->>'taskId'
         AND a.event_type = 'VALET_SESSION_PARKED'
         AND parked_task.task_type = 'PARKING'
         AND parked_task.organization_id = $1::uuid
         AND parked_task.location_id = $2::uuid
       JOIN valet_sessions audit_session
         ON audit_session.organization_id = $1::uuid
        AND audit_session.location_id = $2::uuid
        AND (a.valet_session_id = audit_session.id
          OR (a.valet_session_id IS NULL AND (
            (a.entity_type IN ('ValetSession','VALET_SESSION')
              AND a.entity_id = audit_session.id)
            OR (task_ref.valet_session_id = audit_session.id)
            OR (incident_ref.valet_session_id = audit_session.id)
            OR (a.event_type = 'VALET_SESSION_PARKED'
                AND parked_task.valet_session_id = audit_session.id)
          )))
       WHERE a.organization_id = $1::uuid AND a.location_id = $2::uuid
         AND a.actor_membership_id = member.id
         AND a.event_type::text = ANY($6::text[])
         AND (a.actor_type IS NULL OR a.actor_type = 'MEMBERSHIP')
         AND (a.entity_type NOT IN ('ValetSession','VALET_SESSION')
           OR a.entity_id = audit_session.id)
         AND (a.entity_type NOT IN ('Vehicle','VEHICLE')
           OR (a.valet_session_id = audit_session.id
             AND a.entity_id = audit_session.vehicle_id))
         AND (a.entity_type NOT IN ('Task','TASK')
           OR task_ref.valet_session_id = audit_session.id)
         AND (a.entity_type NOT IN ('Incident','INCIDENT')
           OR incident_ref.valet_session_id = audit_session.id)
         AND (a.event_type <> 'VALET_SESSION_PARKED'
           OR NOT (a.metadata_json ? 'taskId')
           OR parked_task.valet_session_id = audit_session.id)
         AND (a.event_type <> 'VALET_SESSION_PARKED'
           OR a.entity_type NOT IN ('Task', 'TASK')
           OR NOT (a.metadata_json ? 'taskId')
           OR task_ref.id = parked_task.id)
         AND (a.event_type <> 'VALET_SESSION_PARKED'
           OR a.entity_type IN ('ValetSession', 'VALET_SESSION', 'Task', 'TASK'))
         AND (a.event_type <> 'VALET_SESSION_PARKED'
           OR a.entity_type NOT IN ('Task', 'TASK')
           OR task_ref.task_type = 'PARKING'))
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
   AND ($5::uuid IS NULL OR member.id > $5::uuid)
 ORDER BY member.id ASC
 LIMIT $4::integer`;

export async function listAuditInvestigationFilterOptions(
  transaction: PostgresTransaction,
  scope: AuditInvestigationLocationAuthorization,
  query: AuditInvestigationFilterQuery,
  afterMemberId: string | null = null,
): Promise<AuditInvestigationFilterResponse> {
  const result = await transaction.query<SelectorRow>(
    query.kind === "KEY_SLOT" ? slotSql : memberSql,
    [scope.organizationId, scope.locationId, escapeSelectorPrefix(query.text), query.limit + 1,
      ...(query.kind === "MEMBER" ? [afterMemberId, managementAuditKnownEventTypes] : [])],
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
