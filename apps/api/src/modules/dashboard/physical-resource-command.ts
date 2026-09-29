import type {
  CreateKeySlotRequest,
  CreateParkingSpotRequest,
  KeySlotConfiguration,
  ParkingSpotConfiguration,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { PhysicalResourceAuthority } from "./physical-resource-authorization";
import {
  mapPhysicalResourceDatabaseError,
  PhysicalResourceError,
  type PhysicalResourceErrorCode,
} from "./physical-resource-errors";
import {
  keySlotCreateFingerprint,
  parkingSpotCreateFingerprint,
} from "./physical-resource-policy";

interface CommandRow {
  readonly changed: boolean;
  readonly resource_id: string | null;
  readonly result_code: "OK" | PhysicalResourceErrorCode;
}

function requireCommandRow(row: CommandRow | undefined): string {
  if (row === undefined) throw new Error("Physical resource create returned no row.");
  if (row.result_code !== "OK") throw new PhysicalResourceError(row.result_code);
  if (row.resource_id === null) throw new Error("Physical resource create returned no id.");
  return row.resource_id;
}

export async function createKeySlot(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  request: CreateKeySlotRequest,
): Promise<KeySlotConfiguration> {
  try {
    const row = (
      await transaction.query<CommandRow>(
        `SELECT * FROM management_physical_resource_create_key_slot(
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text)`,
        [
          authority.membershipId,
          authority.organizationId,
          authority.locationId,
          request.operationId,
          keySlotCreateFingerprint(authority.locationId, request),
          request.code,
        ],
      )
    ).rows[0];
    const resourceId = requireCommandRow(row);
    const result = await transaction.query<{
      code: string;
      createdAt: Date;
      keySlotId: string;
      status: "ACTIVE" | "INACTIVE";
      updatedAt: Date;
    }>(
      `SELECT id::text AS "keySlotId", code, status::text AS status,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM key_slots
       WHERE id = $1 AND organization_id = $2 AND location_id = $3`,
      [resourceId, authority.organizationId, authority.locationId],
    );
    const projection = result.rows[0];
    if (result.rowCount !== 1 || projection === undefined) {
      throw new Error("Created Key Slot projection is missing.");
    }
    return {
      ...projection,
      createdAt: projection.createdAt.toISOString(),
      updatedAt: projection.updatedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof PhysicalResourceError) throw error;
    return mapPhysicalResourceDatabaseError(error);
  }
}

export async function createParkingSpot(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  request: CreateParkingSpotRequest,
): Promise<ParkingSpotConfiguration> {
  try {
    const row = (
      await transaction.query<CommandRow>(
        `SELECT * FROM management_physical_resource_create_parking_spot(
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text)`,
        [
          authority.membershipId,
          authority.organizationId,
          authority.locationId,
          request.operationId,
          parkingSpotCreateFingerprint(authority.locationId, request),
          request.parkingZoneId,
          request.code,
          request.label,
        ],
      )
    ).rows[0];
    const resourceId = requireCommandRow(row);
    const result = await transaction.query<{
      code: string;
      createdAt: Date;
      label: string;
      parkingSpotId: string;
      status: "ACTIVE" | "INACTIVE";
      updatedAt: Date;
      zoneCode: string;
      zoneId: string;
      zoneLabel: string;
      zoneStatus: "ACTIVE" | "INACTIVE";
    }>(
      `SELECT spot.id::text AS "parkingSpotId", spot.code, spot.label,
              spot.status::text AS status, spot.created_at AS "createdAt",
              spot.updated_at AS "updatedAt", zone.id::text AS "zoneId",
              zone.code AS "zoneCode", zone.label AS "zoneLabel",
              zone.status::text AS "zoneStatus"
       FROM parking_spots AS spot
       INNER JOIN parking_zones AS zone
         ON zone.id = spot.parking_zone_id
        AND zone.organization_id = spot.organization_id
        AND zone.location_id = spot.location_id
       WHERE spot.id = $1 AND spot.organization_id = $2 AND spot.location_id = $3`,
      [resourceId, authority.organizationId, authority.locationId],
    );
    const projection = result.rows[0];
    if (result.rowCount !== 1 || projection === undefined) {
      throw new Error("Created Parking Spot projection is missing.");
    }
    return {
      code: projection.code,
      createdAt: projection.createdAt.toISOString(),
      label: projection.label,
      parkingSpotId: projection.parkingSpotId,
      parkingZone: {
        code: projection.zoneCode,
        label: projection.zoneLabel,
        parkingZoneId: projection.zoneId,
        status: projection.zoneStatus,
      },
      status: projection.status,
      updatedAt: projection.updatedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof PhysicalResourceError) throw error;
    return mapPhysicalResourceDatabaseError(error);
  }
}
