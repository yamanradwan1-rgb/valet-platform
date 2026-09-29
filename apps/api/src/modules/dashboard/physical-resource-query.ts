import type {
  KeySlotConfiguration,
  ParkingSpotConfiguration,
  ParkingZoneSelector,
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
  readonly status: "ACTIVE" | "INACTIVE";
  readonly updatedAt: Date;
}

interface ParkingSpotRow {
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

interface ZoneRow {
  readonly code: string;
  readonly label: string;
  readonly parkingZoneId: string;
  readonly status: "ACTIVE" | "INACTIVE";
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
  const parameters: unknown[] = [authority.organizationId, authority.locationId];
  let keyset = "";
  if (cursor !== null) {
    parameters.push(cursor.sortKey, cursor.id);
    keyset = `AND (slot.code, slot.id) > ($3, $4::uuid)`;
  }
  parameters.push(query.limit + 1);
  const result = await transaction.query<KeySlotRow>(
    `SELECT slot.id::text AS "keySlotId", slot.code,
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
  const codec = physicalResourceCursorCodec("parking-spots", authority.locationId);
  const cursor = codec.decode(query.cursor);
  const parameters: unknown[] = [authority.organizationId, authority.locationId];
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
            zone.status::text AS "zoneStatus"
     FROM parking_spots AS spot
     LEFT JOIN parking_zones AS zone
       ON zone.id = spot.parking_zone_id
      AND zone.organization_id = spot.organization_id
      AND zone.location_id = spot.location_id
     WHERE spot.organization_id = $1 AND spot.location_id = $2 ${keyset}
     ORDER BY spot.code, spot.id LIMIT $${parameters.length}`,
    parameters,
  );
  const current = page(result.rows, query.limit);
  const items: ParkingSpotConfiguration[] = current.rows.map((row) => ({
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    label: row.label,
    parkingSpotId: row.parkingSpotId,
    parkingZone:
      row.zoneId === null || row.zoneCode === null || row.zoneLabel === null || row.zoneStatus === null
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

export async function listParkingZones(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  query: PhysicalResourceListQuery,
) {
  const codec = physicalResourceCursorCodec("parking-zones", authority.locationId);
  const cursor = codec.decode(query.cursor);
  const parameters: unknown[] = [authority.organizationId, authority.locationId];
  let keyset = "";
  if (cursor !== null) {
    parameters.push(cursor.sortKey, cursor.id);
    keyset = `AND (zone.code, zone.id) > ($3, $4::uuid)`;
  }
  parameters.push(query.limit + 1);
  const result = await transaction.query<ZoneRow>(
    `SELECT zone.id::text AS "parkingZoneId", zone.code, zone.label,
            zone.status::text AS status
     FROM parking_zones AS zone
     WHERE zone.organization_id = $1 AND zone.location_id = $2
       AND zone.status = 'ACTIVE' ${keyset}
     ORDER BY zone.code, zone.id LIMIT $${parameters.length}`,
    parameters,
  );
  const current = page(result.rows, query.limit);
  const items: ParkingZoneSelector[] = [...current.rows];
  const last = current.rows.at(-1);
  return {
    items,
    nextCursor:
      current.hasNext && last !== undefined
        ? codec.encode({ id: last.parkingZoneId, sortKey: last.code })
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
