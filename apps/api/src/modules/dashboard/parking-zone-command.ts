import type {
  CreateParkingZoneRequest,
  ParkingZoneSelector,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { PhysicalResourceAuthority } from "./physical-resource-authorization";
import {
  mapPhysicalResourceDatabaseError,
  PhysicalResourceError,
  type PhysicalResourceErrorCode,
} from "./physical-resource-errors";
import { parkingZoneCreateFingerprint } from "./physical-resource-policy";

export async function createParkingZone(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  request: CreateParkingZoneRequest,
): Promise<ParkingZoneSelector> {
  try {
    const row = (
      await transaction.query<{
        resource_id: string | null;
        result_code: "OK" | PhysicalResourceErrorCode;
      }>(
        `SELECT * FROM public.management_physical_resource_create_parking_zone(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text)`,
        [
          authority.membershipId,
          authority.organizationId,
          authority.locationId,
          request.operationId,
          parkingZoneCreateFingerprint(authority.locationId, request),
          request.code,
          request.label,
        ],
      )
    ).rows[0];
    if (row === undefined)
      throw new Error("Parking Zone create returned no row.");
    if (row.result_code !== "OK")
      throw new PhysicalResourceError(row.result_code);
    if (row.resource_id === null)
      throw new Error("Parking Zone create returned no id.");
    const result = await transaction.query<ParkingZoneSelector>(
      `SELECT id::text AS "parkingZoneId", code, label, status::text AS status
       FROM public.parking_zones
       WHERE id = $1 AND organization_id = $2 AND location_id = $3`,
      [row.resource_id, authority.organizationId, authority.locationId],
    );
    const projection = result.rows[0];
    if (result.rowCount !== 1 || projection === undefined) {
      throw new Error("Created Parking Zone projection is missing.");
    }
    return projection;
  } catch (error) {
    if (error instanceof PhysicalResourceError) throw error;
    return mapPhysicalResourceDatabaseError(error);
  }
}
