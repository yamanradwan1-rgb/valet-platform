import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ManagementAuditCursorBoundary } from "./management-audit-cursor";
import { managementAuditKnownEventTypes } from "./management-audit-event-catalog";

export interface ManagementAuditQueryRow {
  readonly actorMembershipId: string | null;
  readonly actorCurrentDisplayName?: string | null;
  readonly actorType: string | null;
  readonly createdAt: Date;
  readonly entityId: string;
  readonly entityType: string;
  readonly eventType: string;
  readonly id: string;
  readonly locationId: string | null;
  readonly metadataJson: unknown;
  readonly occurredAt: Date;
  readonly organizationId: string;
  readonly valetSessionId: string | null;
  readonly vehicleConfirmedPlate?: string | null;
  readonly vehicleMake?: string | null;
  readonly vehicleModel?: string | null;
}

export interface ManagementAuditQueryInput {
  readonly cursor: ManagementAuditCursorBoundary | null;
  readonly eventType: string | null;
  readonly exactLocationId: string | null;
  readonly limit: number;
  readonly organizationId: string;
  readonly organizationLocationFilter: string | null;
  readonly snapshot: string;
  readonly snapshotCreatedAt: Date;
  readonly supervisorEventTypes: readonly string[] | null;
}

function appendPredicate(
  parameters: unknown[],
  fragments: string[],
  sql: string,
  value: unknown,
): void {
  parameters.push(value);
  fragments.push(sql.replace("?", `$${parameters.length}`));
}

export async function queryManagementAuditPage(
  transaction: PostgresTransaction,
  input: ManagementAuditQueryInput,
): Promise<readonly ManagementAuditQueryRow[]> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    Number.isNaN(input.snapshotCreatedAt.getTime()) ||
    (input.exactLocationId !== null &&
      input.organizationLocationFilter !== null)
  ) {
    throw new ApiTransportValidationError();
  }

  const parameters: unknown[] = [
    input.organizationId,
    input.snapshotCreatedAt,
    input.snapshot,
  ];
  const predicates = [
    "event.organization_id = $1::uuid",
    "event.created_at <= $2::timestamptz",
    `(event.pagination_birth_xid IS NULL OR
     pg_visible_in_snapshot(event.pagination_birth_xid, $3::pg_snapshot))`,
  ];

  if (input.exactLocationId !== null) {
    appendPredicate(
      parameters,
      predicates,
      "event.location_id = ?::uuid",
      input.exactLocationId,
    );
  }
  if (input.organizationLocationFilter !== null) {
    appendPredicate(
      parameters,
      predicates,
      "event.location_id = ?::uuid",
      input.organizationLocationFilter,
    );
  }
  if (input.eventType !== null) {
    appendPredicate(
      parameters,
      predicates,
      "event.event_type = ?",
      input.eventType,
    );
  }
  if (input.supervisorEventTypes !== null) {
    appendPredicate(
      parameters,
      predicates,
      "event.event_type = ANY(?::text[])",
      [...input.supervisorEventTypes],
    );
  }
  if (input.cursor !== null) {
    parameters.push(input.cursor.occurredAt, input.cursor.id);
    predicates.push(
      `(event.occurred_at, event.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
    );
  }
  parameters.push(input.limit + 1);
  const pageLimitParameter = parameters.length;
  parameters.push([...managementAuditKnownEventTypes]);
  const allowedEventTypesParameter = parameters.length;

  const result = await transaction.query<ManagementAuditQueryRow>(
    `WITH page AS MATERIALIZED (
       SELECT event.id, event.organization_id, event.location_id,
              event.valet_session_id, event.actor_membership_id,
              event.actor_type, event.event_type, event.entity_type,
              event.entity_id, event.metadata_json, event.occurred_at,
              event.created_at
       FROM audit_events AS event
       WHERE ${predicates.join("\n         AND ")}
       ORDER BY event.occurred_at DESC, event.id DESC
       LIMIT $${pageLimitParameter}
     )
     SELECT page.id::text AS id,
            page.organization_id::text AS "organizationId",
            page.location_id::text AS "locationId",
            page.valet_session_id::text AS "valetSessionId",
            page.actor_membership_id::text AS "actorMembershipId",
            page.actor_type::text AS "actorType",
            page.event_type AS "eventType", page.entity_type AS "entityType",
            page.entity_id::text AS "entityId", page.metadata_json AS "metadataJson",
            page.occurred_at AS "occurredAt", page.created_at AS "createdAt",
            CASE WHEN actor.first_name IS NOT NULL AND actor.last_name IS NOT NULL
              THEN actor.first_name || ' ' || actor.last_name
              ELSE NULL END AS "actorCurrentDisplayName",
            CASE WHEN vehicle.plate_country IS NOT NULL
                   AND vehicle.plate_number_raw IS NOT NULL
              THEN vehicle.plate_number_raw
              ELSE NULL END AS "vehicleConfirmedPlate",
            vehicle.make AS "vehicleMake", vehicle.model AS "vehicleModel"
     FROM page
     LEFT JOIN organization_memberships AS actor
       ON actor.id = page.actor_membership_id
      AND actor.organization_id = page.organization_id
      AND (page.actor_type = 'MEMBERSHIP' OR page.actor_type IS NULL)
      AND actor.status IN ('ACTIVE', 'INACTIVE')
      AND page.event_type = ANY($${allowedEventTypesParameter}::text[])
     LEFT JOIN valet_sessions AS session
       ON session.id = page.entity_id
      AND session.organization_id = page.organization_id
      AND session.location_id = page.location_id
      AND page.entity_type IN ('ValetSession', 'VALET_SESSION')
      AND page.event_type LIKE 'VALET_SESSION_%'
      AND page.event_type = ANY($${allowedEventTypesParameter}::text[])
     LEFT JOIN vehicles AS vehicle
       ON vehicle.id = session.vehicle_id
      AND vehicle.organization_id = page.organization_id
     ORDER BY page.occurred_at DESC, page.id DESC`,
    parameters,
  );
  return result.rows;
}
