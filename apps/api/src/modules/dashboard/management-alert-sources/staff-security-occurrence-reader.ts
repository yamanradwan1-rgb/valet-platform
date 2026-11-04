import type { PostgresTransaction } from "../../../common/database/postgres";
import {
  authorizeStaffSecurityAlert,
  requireAdministrativeAlertQuery,
  type AdministrativeAlertOccurrence,
  type AdministrativeAlertQueryInput,
} from "./administrative-occurrence-authority";

type StaffAuditType = "STAFF_ROLE_CHANGED" | "STAFF_LOCATION_ACCESS_REVOKED";

interface StaffEventRow {
  readonly eventId: string;
  readonly targetMembershipId: string;
  readonly eventType: StaffAuditType;
  readonly occurredAt: Date;
}

/**
 * ALT-15 is Organization-only; do not reuse generic audit list/detail.
 * Writer records each event only after a committed real mutation. Predicates
 * additionally reject malformed/no-change metadata without projecting it.
 */
async function staffOccurrences(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput,
  eventId?: string,
): Promise<AdministrativeAlertOccurrence[]> {
  requireAdministrativeAlertQuery(input, eventId);
  await authorizeStaffSecurityAlert(transaction, input);
  const result = await transaction.query<StaffEventRow>(
    `SELECT event.id::text AS "eventId",
            event.entity_id::text AS "targetMembershipId",
            event.event_type AS "eventType",
            event.occurred_at AS "occurredAt"
     FROM audit_events AS event
     INNER JOIN organization_memberships AS target
       ON target.id=event.entity_id
      AND target.organization_id=event.organization_id
     WHERE event.organization_id=$1::uuid
       AND event.location_id IS NULL
       AND event.entity_type='OrganizationMembership'
       AND event.actor_type='MEMBERSHIP'
       AND event.actor_membership_id IS NOT NULL
       AND event.event_type IN ('STAFF_ROLE_CHANGED','STAFF_LOCATION_ACCESS_REVOKED')
       AND (
         (event.event_type='STAFF_ROLE_CHANGED'
          AND jsonb_typeof(event.metadata_json->'previousRole')='string'
          AND jsonb_typeof(event.metadata_json->'newRole')='string'
          AND event.metadata_json->>'previousRole' <> event.metadata_json->>'newRole')
         OR (event.event_type='STAFF_LOCATION_ACCESS_REVOKED'
          AND (event.metadata_json->>'locationCount') ~ '^[1-9][0-9]*$')
       )
       AND event.occurred_at>=statement_timestamp()-INTERVAL '7 days'
       AND event.occurred_at<=statement_timestamp()
       ${eventId === undefined ? "" : "AND event.id=$3::uuid"}
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $2`,
    [
      input.organizationId,
      input.limit,
      ...(eventId === undefined ? [] : [eventId]),
    ],
  );
  return result.rows.map((row) => ({
    category: "ALT-15",
    eventId: row.eventId,
    targetId: row.targetMembershipId,
    sourceKind: "STAFF",
    organizationId: input.organizationId,
    locationId: null,
    occurredAt: row.occurredAt.toISOString(),
    severity: "IMPORTANT",
    title:
      row.eventType === "STAFF_ROLE_CHANGED"
        ? "Staff role changed"
        : "Staff location access revoked",
  }));
}

export function queryStaffSecurityOccurrences(
  transaction: PostgresTransaction,
  input: AdministrativeAlertQueryInput,
): Promise<AdministrativeAlertOccurrence[]> {
  return staffOccurrences(transaction, input);
}

/** Exact source event; never authorize by membership alone or generic audit. */
export async function findStaffSecurityOccurrence(
  transaction: PostgresTransaction,
  input: Omit<AdministrativeAlertQueryInput, "limit"> & {
    readonly eventId: string;
  },
): Promise<AdministrativeAlertOccurrence | null> {
  return (
    (
      await staffOccurrences(transaction, { ...input, limit: 1 }, input.eventId)
    )[0] ?? null
  );
}
