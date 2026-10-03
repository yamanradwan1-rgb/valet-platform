import type { PostgresTransaction } from "../../common/database/postgres";
import { ConfirmParkedError } from "./confirm-parked-errors";
import type {
  LockedConfirmSession,
  LockedParkingSpot,
} from "./confirm-parked-types";

// These exact scoped predicates are shared by preflight and final locked reads.
export const parkingSpotPredicate = `spot.organization_id = $1
  AND spot.location_id = $2 AND spot.code = $3
  AND ($4::uuid IS NULL OR spot.id = $4::uuid)
  AND spot.status = 'ACTIVE' AND spot.parking_zone_id IS NOT NULL`;

export const parkingZonePredicate = `zone.organization_id = spot.organization_id
  AND zone.location_id = spot.location_id AND zone.id = spot.parking_zone_id
  AND zone.status = 'ACTIVE'`;

export function parkingSpotOccupancyPredicate(
  spot: "$3" | "spot.id",
  session: "$4" | "$5",
) {
  return `occupant.organization_id = $1 AND occupant.location_id = $2
    AND occupant.parking_spot_id = ${spot} AND occupant.id <> ${session}`;
}

export function requireCompatibleParkingSpot(
  session: Pick<LockedConfirmSession, "parking_zone_id">,
  spot: LockedParkingSpot | undefined,
): LockedParkingSpot {
  if (
    spot === undefined ||
    (session.parking_zone_id !== null &&
      session.parking_zone_id !== spot.parking_zone_id)
  ) {
    throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
  }
  return spot;
}

export function assertParkingSpotAvailable(
  zoneActive: boolean,
  occupied: boolean,
): void {
  if (!zoneActive || occupied) {
    throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
  }
}

/** One coherent resource snapshot; deliberately obtains no resource row locks. */
export async function readParkingSpotAvailability(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  code: string,
  id?: string,
): Promise<LockedParkingSpot> {
  const result = await transaction.query<
    LockedParkingSpot & { occupied: boolean }
  >(
    `SELECT spot.id::text, spot.code, spot.parking_zone_id::text,
       EXISTS (SELECT 1 FROM valet_sessions AS occupant
         WHERE ${parkingSpotOccupancyPredicate("spot.id", "$5")}) AS occupied
     FROM parking_spots AS spot
     INNER JOIN parking_zones AS zone ON ${parkingZonePredicate}
     WHERE ${parkingSpotPredicate}`,
    [
      session.organization_id,
      session.location_id,
      code.trim(),
      id ?? null,
      session.id,
    ],
  );
  const spot = requireCompatibleParkingSpot(session, result.rows[0]);
  assertParkingSpotAvailable(true, result.rows[0]!.occupied);
  return spot;
}
