import type {
  SessionOverviewEntry,
  SessionStateCountsResponse,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import {
  createOverviewCursorCodec,
  type OverviewCursor,
} from "./overview-cursor";

const cursorCodec = createOverviewCursorCodec("sessions");

interface SessionRow {
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
    limit: number;
    locationId: string;
  },
): Promise<{ items: SessionOverviewEntry[]; nextCursor: string | null }> {
  const cursor: OverviewCursor | null = cursorCodec.decode(input.cursor);
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
    const predicates = [
      "session.organization_id = $1",
      "session.location_id = $2",
      "session.state <> 'COMPLETED'",
    ];
    const parameters: unknown[] = [scope.organizationId, input.locationId];
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
              vehicle.temporary_descriptor AS "temporaryDescriptor"
       FROM valet_sessions AS session
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       WHERE ${predicates.join(" AND ")}
       ORDER BY session.created_at DESC, session.id DESC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows.slice(0, input.limit).map((row) => ({
      createdAt: row.createdAt.toISOString(),
      currentAssigneeMembershipId: row.currentAssigneeMembershipId,
      keySlotId: row.keySlotId,
      parkingSpotId: row.parkingSpotId,
      sessionId: row.sessionId,
      state: row.state as SessionOverviewEntry["state"],
      updatedAt: row.updatedAt.toISOString(),
      vehicle: {
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
