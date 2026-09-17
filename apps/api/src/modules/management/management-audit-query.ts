import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { ManagementAuditCursorBoundary } from "./management-audit-cursor";

export interface ManagementAuditQueryRow {
  readonly actorMembershipId: string | null;
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
}

export interface ManagementAuditQueryInput {
  readonly cursor: ManagementAuditCursorBoundary | null;
  readonly eventType: string | null;
  readonly exactLocationId: string | null;
  readonly limit: number;
  readonly organizationId: string;
  readonly organizationLocationFilter: string | null;
  readonly snapshotCreatedAt: Date;
  readonly supervisorEventTypes: readonly string[] | null;
}

export async function managementAuditDatabaseNow(
  transaction: PostgresTransaction,
): Promise<Date> {
  const result = await transaction.query<{ readonly now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = result.rows[0]?.now;
  if (result.rowCount !== 1 || now === undefined) {
    throw new Error("Audit snapshot time is unavailable.");
  }
  return now;
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

  const parameters: unknown[] = [input.organizationId, input.snapshotCreatedAt];
  const predicates = [
    "event.organization_id = $1::uuid",
    "event.created_at <= $2::timestamptz",
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

  const result = await transaction.query<ManagementAuditQueryRow>(
    `SELECT event.id::text AS id,
            event.organization_id::text AS "organizationId",
            event.location_id::text AS "locationId",
            event.valet_session_id::text AS "valetSessionId",
            event.actor_membership_id::text AS "actorMembershipId",
            event.actor_type::text AS "actorType",
            event.event_type AS "eventType", event.entity_type AS "entityType",
            event.entity_id::text AS "entityId", event.metadata_json AS "metadataJson",
            event.occurred_at AS "occurredAt", event.created_at AS "createdAt"
     FROM audit_events AS event
     WHERE ${predicates.join("\n       AND ")}
     ORDER BY event.occurred_at DESC, event.id DESC
     LIMIT $${parameters.length}`,
    parameters,
  );
  return result.rows;
}
