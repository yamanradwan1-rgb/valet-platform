import type {
  KeySlotConfiguration,
  ParkingSpotListEntry,
  PhysicalResourceLabel,
  PhysicalResourceListQuery,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { PhysicalResourceAuthority } from "./physical-resource-authorization";
import { physicalResourceCursorCodec } from "./physical-resource-cursor";
import { PhysicalResourceError } from "./physical-resource-errors";

interface KeySlotRow {
  readonly code: string;
  readonly createdAt: Date;
  readonly keySlotId: string;
  readonly label: string | null;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly updatedAt: Date;
}

interface ParkingSpotRow {
  readonly operational: boolean;
  readonly sessionId: string | null;
  readonly sessionState:
    NonNullable<ParkingSpotListEntry["occupancy"]>["sessionState"] | null;
  readonly plateNumberNormalized: string | null;
  readonly temporaryDescriptor: string | null;
  readonly code: string;
  readonly createdAt: Date;
  readonly label: string;
  readonly parkingSpotId: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly updatedAt: Date;
  readonly zoneCode: string | null;
  readonly zoneId: string | null;
  readonly zoneLabel: string | null;
  readonly zoneStatus: "ACTIVE" | "INACTIVE" | null;
}

function page<T extends { readonly code: string }>(
  rows: readonly T[],
  limit: number,
) {
  return { hasNext: rows.length > limit, rows: rows.slice(0, limit) };
}

export async function listKeySlots(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  query: PhysicalResourceListQuery,
) {
  const codec = physicalResourceCursorCodec("key-slots", authority.locationId);
  const cursor = codec.decode(query.cursor);
  const parameters: unknown[] = [
    authority.organizationId,
    authority.locationId,
  ];
  let keyset = "";
  if (cursor !== null) {
    parameters.push(cursor.sortKey, cursor.id);
    keyset = `AND (slot.code, slot.id) > ($3, $4::uuid)`;
  }
  parameters.push(query.limit + 1);
  const result = await transaction.query<KeySlotRow>(
    `SELECT slot.id::text AS "keySlotId", slot.code, slot.label,
            slot.status::text AS status, slot.created_at AS "createdAt",
            slot.updated_at AS "updatedAt"
     FROM key_slots AS slot
     WHERE slot.organization_id = $1 AND slot.location_id = $2 ${keyset}
     ORDER BY slot.code, slot.id LIMIT $${parameters.length}`,
    parameters,
  );
  const current = page(result.rows, query.limit);
  const items: KeySlotConfiguration[] = current.rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
  const last = current.rows.at(-1);
  return {
    items,
    nextCursor:
      current.hasNext && last !== undefined
        ? codec.encode({ id: last.keySlotId, sortKey: last.code })
        : null,
  };
}

export async function listParkingSpots(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  query: PhysicalResourceListQuery,
) {
  const codec = physicalResourceCursorCodec(
    "parking-spots",
    authority.locationId,
  );
  const cursor = codec.decode(query.cursor);
  const parameters: unknown[] = [
    authority.organizationId,
    authority.locationId,
  ];
  let keyset = "";
  if (cursor !== null) {
    parameters.push(cursor.sortKey, cursor.id);
    keyset = `AND (spot.code, spot.id) > ($3, $4::uuid)`;
  }
  parameters.push(query.limit + 1);
  const result = await transaction.query<ParkingSpotRow>(
    `SELECT spot.id::text AS "parkingSpotId", spot.code, spot.label,
            spot.status::text AS status, spot.created_at AS "createdAt",
            spot.updated_at AS "updatedAt", zone.id::text AS "zoneId",
            zone.code AS "zoneCode", zone.label AS "zoneLabel",
            zone.status::text AS "zoneStatus",
            location.status = 'ACTIVE' AS operational,
            session.id::text AS "sessionId", session.state::text AS "sessionState",
            vehicle.plate_number_normalized AS "plateNumberNormalized",
            vehicle.temporary_descriptor AS "temporaryDescriptor"
     FROM parking_spots AS spot
     INNER JOIN locations AS location
       ON location.id = spot.location_id AND location.organization_id = spot.organization_id
     LEFT JOIN parking_zones AS zone
       ON zone.id = spot.parking_zone_id
      AND zone.organization_id = spot.organization_id
      AND zone.location_id = spot.location_id
     LEFT JOIN valet_sessions AS session
       ON session.parking_spot_id = spot.id
      AND session.organization_id = spot.organization_id
      AND session.location_id = spot.location_id
      AND session.state NOT IN ('COMPLETED', 'CANCELLED')
      AND location.status = 'ACTIVE'
     LEFT JOIN vehicles AS vehicle
       ON vehicle.id = session.vehicle_id AND vehicle.organization_id = session.organization_id
     WHERE spot.organization_id = $1 AND spot.location_id = $2 ${keyset}
     ORDER BY spot.code, spot.id LIMIT $${parameters.length}`,
    parameters,
  );
  const current = page(result.rows, query.limit);
  const items: ParkingSpotListEntry[] = current.rows.map((row) => ({
    ...(row.operational
      ? {
          occupancy:
            row.sessionId === null || row.sessionState === null
              ? null
              : {
                  sessionId: row.sessionId,
                  sessionState: row.sessionState,
                  vehicle: {
                    plateNumberNormalized: row.plateNumberNormalized,
                    temporaryDescriptor: row.temporaryDescriptor,
                  },
                },
        }
      : {}),
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    label: row.label,
    parkingSpotId: row.parkingSpotId,
    parkingZone:
      row.zoneId === null ||
      row.zoneCode === null ||
      row.zoneLabel === null ||
      row.zoneStatus === null
        ? null
        : {
            code: row.zoneCode,
            label: row.zoneLabel,
            parkingZoneId: row.zoneId,
            status: row.zoneStatus,
          },
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  }));
  const last = current.rows.at(-1);
  return {
    items,
    nextCursor:
      current.hasNext && last !== undefined
        ? codec.encode({ id: last.parkingSpotId, sortKey: last.code })
        : null,
  };
}

export async function readPhysicalResourceLabel(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  kind: "key-slot" | "parking-spot",
  resourceId: string,
): Promise<PhysicalResourceLabel> {
  const table = kind === "key-slot" ? "key_slots" : "parking_spots";
  const result = await transaction.query<{
    code: string;
    locationCode: string;
    locationName: string;
  }>(
    `SELECT resource.code, location.code AS "locationCode",
            location.name AS "locationName"
     FROM ${table} AS resource
     INNER JOIN locations AS location
       ON location.id = resource.location_id
      AND location.organization_id = resource.organization_id
      AND location.status = 'ACTIVE'
     WHERE resource.id = $1 AND resource.organization_id = $2
       AND resource.location_id = $3 AND resource.status = 'ACTIVE'`,
    [resourceId, authority.organizationId, authority.locationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new PhysicalResourceError("AUTHORIZATION_DENIED");
  }
  return {
    code: row.code,
    location: {
      code: row.locationCode,
      locationId: authority.locationId,
      name: row.locationName,
    },
    qrPayload: `vaylet:v2:${kind}:${resourceId}:${row.code}`,
    resourceId,
    resourceType: kind === "key-slot" ? "KEY_SLOT" : "PARKING_SPOT",
    version: "V2",
  };
}
