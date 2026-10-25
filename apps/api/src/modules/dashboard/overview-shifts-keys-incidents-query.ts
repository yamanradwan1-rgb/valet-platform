import { listIncidents } from "./incidents-query";
import type {
  ActiveShiftOverviewEntry,
  KeySlotOverviewEntry,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import { createOverviewCursorCodec } from "./overview-cursor";

const shiftCursorCodec = createOverviewCursorCodec("active-shifts");
const keyCursorCodec = createOverviewCursorCodec("keys");

interface ShiftRow {
  readonly membershipId: string;
  readonly shiftId: string;
  readonly startedAt: Date;
}

export async function listActiveShifts(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    cursor?: string;
    limit: number;
    locationId: string;
  },
): Promise<{ items: ActiveShiftOverviewEntry[]; nextCursor: string | null }> {
  const cursor = shiftCursorCodec.decode(input.cursor);
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
      "shift.organization_id = $1",
      "shift.location_id = $2",
      "shift.status = 'ACTIVE'",
    ];
    const parameters: unknown[] = [scope.organizationId, input.locationId];
    if (cursor !== null) {
      parameters.push(cursor.sortKey, cursor.tiebreakerId);
      predicates.push(
        `(shift.started_at, shift.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const rows = await transaction.query<ShiftRow>(
      `SELECT shift.id::text AS "shiftId",
              shift.membership_id::text AS "membershipId",
              shift.started_at AS "startedAt"
       FROM shifts AS shift
       WHERE ${predicates.join(" AND ")}
       ORDER BY shift.started_at DESC, shift.id DESC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows.slice(0, input.limit).map((row) => ({
      membershipId: row.membershipId,
      shiftId: row.shiftId,
      startedAt: row.startedAt.toISOString(),
    }));
    const last = rows.rows[input.limit - 1];
    const nextCursor =
      rows.rows.length > input.limit && last !== undefined
        ? shiftCursorCodec.encode({
            sortKey: last.startedAt.toISOString(),
            tiebreakerId: last.shiftId,
          })
        : null;
    return { items, nextCursor };
  });
}

interface KeySlotRow {
  readonly code: string;
  readonly holdingSessionId: string | null;
  readonly plateNumberNormalized: string | null;
  readonly temporaryDescriptor: string | null;
  readonly keySlotId: string;
  readonly slotStatus: string;
}

export async function listKeyAccountability(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    cursor?: string;
    limit: number;
    locationId: string;
  },
): Promise<{ items: KeySlotOverviewEntry[]; nextCursor: string | null }> {
  const cursor = keyCursorCodec.decode(input.cursor);
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
    const predicates = ["slot.organization_id = $1", "slot.location_id = $2"];
    const parameters: unknown[] = [scope.organizationId, input.locationId];
    if (cursor !== null) {
      parameters.push(cursor.sortKey, cursor.tiebreakerId);
      predicates.push(
        `(slot.code, slot.id) > ($${parameters.length - 1}, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const rows = await transaction.query<KeySlotRow>(
      `SELECT slot.id::text AS "keySlotId",
              slot.code,
              slot.status::text AS "slotStatus",
              holder.id::text AS "holdingSessionId",
              vehicle.plate_number_normalized AS "plateNumberNormalized",
              vehicle.temporary_descriptor AS "temporaryDescriptor"
       FROM key_slots AS slot
       LEFT JOIN LATERAL (
           SELECT session.id, session.vehicle_id
           FROM valet_sessions AS session
           WHERE session.organization_id = slot.organization_id
             AND session.location_id = slot.location_id
             AND session.key_slot_id = slot.id
             AND session.state NOT IN ('COMPLETED', 'CANCELLED')
           ORDER BY session.updated_at DESC, session.id DESC
           LIMIT 1
       ) AS holder ON TRUE
       LEFT JOIN vehicles AS vehicle
         ON vehicle.id = holder.vehicle_id
        AND vehicle.organization_id = slot.organization_id
       WHERE ${predicates.join(" AND ")}
       ORDER BY slot.code ASC, slot.id ASC
       LIMIT $${parameters.length}`,
      parameters,
    );
    const items = rows.rows.slice(0, input.limit).map((row) => ({
      code: row.code,
      holdingSessionId: row.holdingSessionId,
      holdingVehicle:
        row.holdingSessionId === null
          ? null
          : {
              plateNumberNormalized: row.plateNumberNormalized,
              temporaryDescriptor: row.temporaryDescriptor,
            },
      keySlotId: row.keySlotId,
      slotStatus: row.slotStatus as KeySlotOverviewEntry["slotStatus"],
    }));
    const last = rows.rows[input.limit - 1];
    const nextCursor =
      rows.rows.length > input.limit && last !== undefined
        ? keyCursorCodec.encode({
            sortKey: last.code,
            tiebreakerId: last.keySlotId,
          })
        : null;
    return { items, nextCursor };
  });
}

// Compatibility for existing active-only overview consumers. Dashboard's list uses All.
export function listOpenIncidents(
  pool: PostgresPool,
  input: Parameters<typeof listIncidents>[1],
) {
  return listIncidents(pool, { ...input, filter: "ACTIVE" });
}
