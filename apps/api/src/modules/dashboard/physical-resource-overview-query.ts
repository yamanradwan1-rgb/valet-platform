import type {
  PhysicalResourceOverviewQuery,
  PhysicalResourceOverviewResponse,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { PhysicalResourceAuthority } from "./physical-resource-authorization";
import { physicalResourceCursorCodec } from "./physical-resource-cursor";
import { PhysicalResourceError } from "./physical-resource-errors";
import { listParkingSpots } from "./physical-resource-query";

interface CountsRow {
  readonly operational: boolean;
  readonly keyConfigured: number;
  readonly keyActive: number;
  readonly keyAvailable: number;
  readonly keyInUse: number;
  readonly keyInactive: number;
  readonly spotConfigured: number;
  readonly spotActive: number;
  readonly spotAvailable: number;
  readonly spotOccupied: number;
  readonly spotInactive: number;
}

interface KeyOverviewRow {
  readonly code: string;
  readonly keySlotId: string;
  readonly label: string | null;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly operational: boolean;
  readonly holdingSessionId: string | null;
  readonly plateNumberNormalized: string | null;
  readonly temporaryDescriptor: string | null;
}

export async function countPhysicalResources(
  tx: PostgresTransaction,
  authority: PhysicalResourceAuthority,
): Promise<PhysicalResourceOverviewResponse["counts"]> {
  const result = await tx.query<CountsRow>(
    `SELECT location.status = 'ACTIVE' AS operational,
      (keys.active + keys.inactive)::int AS "keyConfigured",
      keys.active::int AS "keyActive",
      keys.available::int AS "keyAvailable",
      keys.used::int AS "keyInUse",
      keys.inactive::int AS "keyInactive",
      (spots.active + spots.inactive)::int AS "spotConfigured",
      spots.active::int AS "spotActive",
      spots.available::int AS "spotAvailable",
      spots.used::int AS "spotOccupied",
      spots.inactive::int AS "spotInactive"
     FROM locations AS location
     CROSS JOIN LATERAL (
       SELECT
         count(*) FILTER (WHERE slot.status = 'ACTIVE') AS active,
         count(*) FILTER (WHERE slot.status = 'INACTIVE') AS inactive,
         count(*) FILTER (WHERE slot.status = 'ACTIVE' AND holder.id IS NULL) AS available,
         count(*) FILTER (WHERE slot.status = 'ACTIVE' AND holder.id IS NOT NULL) AS used
       FROM key_slots AS slot
       LEFT JOIN valet_sessions AS holder
         ON holder.key_slot_id = slot.id
        AND holder.organization_id = slot.organization_id
        AND holder.location_id = slot.location_id
        AND holder.state NOT IN ('COMPLETED','CANCELLED')
       WHERE slot.organization_id = location.organization_id
         AND slot.location_id = location.id
     ) AS keys
     CROSS JOIN LATERAL (
       SELECT
         count(*) FILTER (WHERE spot.status = 'ACTIVE') AS active,
         count(*) FILTER (WHERE spot.status = 'INACTIVE') AS inactive,
         count(*) FILTER (WHERE spot.status = 'ACTIVE' AND holder.id IS NULL) AS available,
         count(*) FILTER (WHERE spot.status = 'ACTIVE' AND holder.id IS NOT NULL) AS used
       FROM parking_spots AS spot
       LEFT JOIN valet_sessions AS holder
         ON holder.parking_spot_id = spot.id
        AND holder.organization_id = spot.organization_id
        AND holder.location_id = spot.location_id
        AND holder.state NOT IN ('COMPLETED','CANCELLED')
       WHERE spot.organization_id = location.organization_id
         AND spot.location_id = location.id
     ) AS spots
     WHERE location.organization_id = $1 AND location.id = $2`,
    [authority.organizationId, authority.locationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || !row) {
    throw new PhysicalResourceError("AUTHORIZATION_DENIED");
  }
  return {
    keySlots: {
      configured: row.keyConfigured,
      active: row.keyActive,
      available: row.operational ? row.keyAvailable : null,
      inUse: row.operational ? row.keyInUse : null,
      unknown: row.keyInactive + (row.operational ? 0 : row.keyActive),
    },
    parkingSpots: {
      configured: row.spotConfigured,
      active: row.spotActive,
      available: row.operational ? row.spotAvailable : null,
      occupied: row.operational ? row.spotOccupied : null,
      unknown: row.spotInactive + (row.operational ? 0 : row.spotActive),
    },
  };
}

export async function listUnifiedKeySlots(
  tx: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  query: PhysicalResourceOverviewQuery,
): Promise<PhysicalResourceOverviewResponse["keySlots"]> {
  const codec = physicalResourceCursorCodec("key-slots", authority.locationId);
  const cursor = codec.decode(query.keyCursor);
  const params: unknown[] = [authority.organizationId, authority.locationId];
  const cursorClause =
    cursor === null ? "" : "AND (slot.code,slot.id) > ($3,$4::uuid)";
  if (cursor !== null) params.push(cursor.sortKey, cursor.id);
  params.push(query.limit + 1);
  const result = await tx.query<KeyOverviewRow>(
    `SELECT slot.id::text AS "keySlotId", slot.code, slot.label,
       slot.status::text AS status,
       location.status = 'ACTIVE' AS operational,
       holder.id::text AS "holdingSessionId",
       vehicle.plate_number_normalized AS "plateNumberNormalized",
       vehicle.temporary_descriptor AS "temporaryDescriptor"
     FROM key_slots AS slot
     INNER JOIN locations AS location
       ON location.id = slot.location_id
      AND location.organization_id = slot.organization_id
     LEFT JOIN valet_sessions AS holder
       ON holder.key_slot_id = slot.id
      AND holder.organization_id = slot.organization_id
      AND holder.location_id = slot.location_id
      AND holder.state NOT IN ('COMPLETED','CANCELLED')
      AND location.status = 'ACTIVE'
      AND slot.status = 'ACTIVE'
     LEFT JOIN vehicles AS vehicle
       ON vehicle.id = holder.vehicle_id
      AND vehicle.organization_id = holder.organization_id
     WHERE slot.organization_id = $1 AND slot.location_id = $2
       ${cursorClause}
     ORDER BY slot.code, slot.id LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, query.limit);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => ({
      keySlotId: row.keySlotId,
      code: row.code,
      status: row.status,
      label: row.label,
      usage:
        row.status !== "ACTIVE" || !row.operational
          ? ("UNKNOWN" as const)
          : row.holdingSessionId === null
            ? ("AVAILABLE" as const)
            : ("IN_USE" as const),
      holdingSessionId: row.holdingSessionId,
      holdingVehicle:
        row.holdingSessionId === null
          ? null
          : {
              plateNumberNormalized: row.plateNumberNormalized,
              temporaryDescriptor: row.temporaryDescriptor,
            },
    })),
    nextCursor:
      result.rows.length > query.limit && last
        ? codec.encode({ id: last.keySlotId, sortKey: last.code })
        : null,
  };
}

export async function readPhysicalResourceOverview(
  tx: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  query: PhysicalResourceOverviewQuery,
): Promise<PhysicalResourceOverviewResponse> {
  const counts = await countPhysicalResources(tx, authority);
  const keySlots = await listUnifiedKeySlots(tx, authority, query);
  const existingSpots = await listParkingSpots(tx, authority, {
    limit: query.limit,
    ...(query.spotCursor ? { cursor: query.spotCursor } : {}),
  });
  const parkingSpots = {
    nextCursor: existingSpots.nextCursor,
    items: existingSpots.items.map((spot) => ({
      ...spot,
      usage:
        spot.status !== "ACTIVE" || spot.occupancy === undefined
          ? ("UNKNOWN" as const)
          : spot.occupancy === null
            ? ("AVAILABLE" as const)
            : ("OCCUPIED" as const),
    })),
  };
  return { counts, keySlots, parkingSpots };
}
