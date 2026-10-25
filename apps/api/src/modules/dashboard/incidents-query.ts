import type {
  IncidentListFilter,
  IncidentOverviewEntry,
} from "@valet/contracts";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import { canonicalHistoryName } from "./operational-history-identity-projection";
import { createOverviewCursorCodec } from "./overview-cursor";

interface IncidentRow {
  incidentId: string;
  valetSessionId: string;
  status: IncidentOverviewEntry["status"];
  severity: IncidentOverviewEntry["severity"];
  type: string;
  description: string;
  reporterFirstName: string | null;
  reporterLastName: string | null;
  resolverFirstName: string | null;
  resolverLastName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
}

function display(firstName: string | null, lastName: string | null) {
  const name = canonicalHistoryName({ firstName, lastName });
  return name === null ? null : `${name.firstName} ${name.lastName}`;
}

export async function queryIncidents(
  transaction: PostgresTransaction,
  input: {
    organizationId: string;
    locationId: string;
    incidentId?: string;
    filter: IncidentListFilter;
    limit: number;
    cursor?: string;
  },
) {
  const codec = createOverviewCursorCodec(
    `incidents:${input.locationId}:${input.filter}`,
  );
  const cursor = codec.decode(input.cursor);
  const predicates = ["incident.organization_id=$1", "incident.location_id=$2"];
  const parameters: unknown[] = [input.organizationId, input.locationId];
  if (input.filter === "ACTIVE")
    predicates.push("incident.status IN ('OPEN','INVESTIGATING')");
  if (input.filter === "RESOLVED")
    predicates.push("incident.status='RESOLVED'");
  if (input.incidentId) {
    parameters.push(input.incidentId);
    predicates.push(`incident.id=$${parameters.length}`);
  }
  if (cursor) {
    parameters.push(cursor.sortKey, cursor.tiebreakerId);
    predicates.push(
      `(incident.created_at,incident.id)<($${parameters.length - 1}::timestamptz,$${parameters.length}::uuid)`,
    );
  }
  parameters.push(input.limit + 1);
  const result = await transaction.query<IncidentRow>(
    `SELECT incident.id::text AS "incidentId",incident.valet_session_id::text AS "valetSessionId",
       incident.status::text,incident.severity::text,incident.type,incident.description,
       incident.created_at AS "createdAt",incident.resolved_at AS "resolvedAt",
       incident.resolution_notes AS "resolutionNotes",
       reporter.first_name AS "reporterFirstName",reporter.last_name AS "reporterLastName",
       resolver.first_name AS "resolverFirstName",resolver.last_name AS "resolverLastName"
     FROM incidents incident
     LEFT JOIN organization_memberships reporter ON reporter.organization_id=incident.organization_id
       AND reporter.id=incident.reported_by_membership_id
     LEFT JOIN organization_memberships resolver ON resolver.organization_id=incident.organization_id
       AND resolver.id=incident.resolved_by_membership_id
     WHERE ${predicates.join(" AND ")} ORDER BY incident.created_at DESC,incident.id DESC
     LIMIT $${parameters.length}`,
    parameters,
  );
  const items: IncidentOverviewEntry[] = result.rows
    .slice(0, input.limit)
    .map((row) => ({
      incidentId: row.incidentId,
      valetSessionId: row.valetSessionId,
      status: row.status,
      severity: row.severity,
      type: row.type,
      description: row.description,
      reporterDisplayName: display(row.reporterFirstName, row.reporterLastName),
      resolvedByDisplayName: display(
        row.resolverFirstName,
        row.resolverLastName,
      ),
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNotes: row.resolutionNotes,
    }));
  const last = result.rows[input.limit - 1];
  return {
    items,
    nextCursor:
      result.rows.length > input.limit && last !== undefined
        ? codec.encode({
            sortKey: last.createdAt.toISOString(),
            tiebreakerId: last.incidentId,
          })
        : null,
  };
}

export function listIncidents(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    limit: number;
    cursor?: string;
    filter?: IncidentListFilter;
  },
) {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "LOCATION_DASHBOARD_READ",
      ...(input.staffSessionContext
        ? { staffSessionContext: input.staffSessionContext }
        : {}),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    return queryIncidents(transaction, {
      organizationId: scope.organizationId,
      locationId: input.locationId,
      limit: input.limit,
      filter: input.filter ?? "ALL",
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
  });
}
