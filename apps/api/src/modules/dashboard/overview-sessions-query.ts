import { sessionOverviewFilterStates } from "@valet/contracts";
import type {
  SessionOverviewFilter,
  SessionOverviewEntry,
  SessionStateCountsResponse,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import { sessionOverviewCursor } from "./session-overview-cursor";
import {
  operationalAssigneeColumn,
  operationalAssigneeJoins,
} from "./operational-assignee-projection";
import {
  sessionResourceColumns,
  sessionResourceJoins,
} from "./session-resource-projection";

interface SessionRow {
  readonly activeTaskId: string | null;
  readonly assignee: NonNullable<
    SessionOverviewEntry["activeTask"]
  >["assignee"];
  readonly keySlot: SessionOverviewEntry["keySlot"];
  readonly parkingSpot: SessionOverviewEntry["parkingSpot"];
  readonly parkingZone: SessionOverviewEntry["parkingZone"];
  readonly make: string | null;
  readonly model: string | null;
  readonly color: string | null;
  readonly createdAt: Date;
  readonly currentAssigneeMembershipId: string | null;
  readonly keySlotId: string | null;
  readonly parkingSpotId: string | null;
  readonly plateCountry: string | null;
  readonly plateNumberNormalized: string | null;
  readonly sessionId: string;
  readonly state: string;
  readonly temporaryDescriptor: string | null;
  readonly updatedAt: Date;
  readonly vehicleId: string;
}

interface StateCountRow {
  readonly count: number;
  readonly state: string;
}

const canonicalStates = [
  "CHECKING_IN",
  "AWAITING_PARKING",
  "PARKING",
  "PARKED",
  "REQUESTED",
  "RETRIEVING",
  "READY",
  "HANDOFF_PENDING",
  "COMPLETED",
] as const;

export async function listDashboardSessions(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    cursor?: string;
    filter?: SessionOverviewFilter;
    limit: number;
    locationId: string;
  },
): Promise<{ items: SessionOverviewEntry[]; nextCursor: string | null }> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "LOCATION_DASHBOARD_READ",
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const filter = input.filter ?? "ALL";
    const cursorCodec = sessionOverviewCursor({
      organizationId: scope.organizationId,
      locationId: input.locationId,
      filter,
    });
    const cursor = cursorCodec.decode(input.cursor);
    const predicates = [
      "session.organization_id = $1",
      "session.location_id = $2",
      "session.state::text = ANY($3::text[])",
    ];
    const parameters: unknown[] = [
      scope.organizationId,
      input.locationId,
      sessionOverviewFilterStates[filter],
    ];
    if (cursor !== null) {
      parameters.push(cursor.sortKey, cursor.tiebreakerId);
      predicates.push(
        `(session.created_at, session.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const rows = await transaction.query<SessionRow>(
      `SELECT session.id::text AS "sessionId",
              session.state::text AS state,
              session.created_at AS "createdAt",
              session.updated_at AS "updatedAt",
              session.key_slot_id::text AS "keySlotId",
              session.parking_spot_id::text AS "parkingSpotId",
              session.current_assignee_membership_id::text
                AS "currentAssigneeMembershipId",
              vehicle.id::text AS "vehicleId",
              vehicle.plate_country AS "plateCountry",
              vehicle.plate_number_normalized AS "plateNumberNormalized",
              vehicle.temporary_descriptor AS "temporaryDescriptor",
              vehicle.make, vehicle.model, vehicle.color,
              current_task.id::text AS "activeTaskId",
              ${operationalAssigneeColumn}, ${sessionResourceColumns}
       FROM valet_sessions AS session
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       LEFT JOIN LATERAL (
         SELECT task.id, task.organization_id, task.status, task.current_assignee_membership_id
         FROM tasks AS task
         WHERE task.organization_id = session.organization_id
           AND task.location_id = session.location_id AND task.valet_session_id = session.id
           AND task.task_type IN ('PARKING', 'RETRIEVAL')
           AND task.status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
         ORDER BY task.created_at DESC, task.id DESC LIMIT 1
       ) AS current_task ON TRUE
       ${operationalAssigneeJoins("current_task")}
       ${sessionResourceJoins}
       WHERE ${predicates.join(" AND ")}
       ORDER BY session.created_at DESC, session.id DESC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows.slice(0, input.limit).map((row) => ({
      createdAt: row.createdAt.toISOString(),
      currentAssigneeMembershipId: row.currentAssigneeMembershipId,
      activeTask:
        row.activeTaskId === null
          ? null
          : { taskId: row.activeTaskId, assignee: row.assignee },
      keySlot: row.keySlot,
      parkingSpot: row.parkingSpot,
      parkingZone: row.parkingZone,
      keySlotId: row.keySlotId,
      parkingSpotId: row.parkingSpotId,
      sessionId: row.sessionId,
      state: row.state as SessionOverviewEntry["state"],
      updatedAt: row.updatedAt.toISOString(),
      vehicle: {
        make: row.make,
        model: row.model,
        color: row.color,
        plateCountry: row.plateCountry,
        plateNumberNormalized: row.plateNumberNormalized,
        temporaryDescriptor: row.temporaryDescriptor,
        vehicleId: row.vehicleId,
      },
    }));
    const last = rows.rows[input.limit - 1];
    const nextCursor =
      rows.rows.length > input.limit && last !== undefined
        ? cursorCodec.encode({
            sortKey: last.createdAt.toISOString(),
            tiebreakerId: last.sessionId,
          })
        : null;
    return { items, nextCursor };
  });
}

export async function dashboardSessionStateCounts(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    staffSessionContext?: StaffSessionContext;
  },
): Promise<SessionStateCountsResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId: input.authenticatedUserId,
      capability: "LOCATION_DASHBOARD_READ",
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      targetLocationId: input.locationId,
    });
    assertAuthorized(scope);
    const rows = await transaction.query<StateCountRow>(
      `SELECT state::text AS state, count(*)::int AS count
       FROM valet_sessions
       WHERE organization_id = $1 AND location_id = $2
       GROUP BY state`,
      [scope.organizationId, input.locationId],
    );
    const counts = new Map(rows.rows.map((row) => [row.state, row.count]));
    return {
      counts: canonicalStates.map((state) => ({
        count: counts.get(state) ?? 0,
        state,
      })),
    };
  });
}
