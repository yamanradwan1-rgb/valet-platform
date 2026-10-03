import type { PostgresTransaction } from "../../common/database/postgres";
import { ConfirmParkedError } from "./confirm-parked-errors";
import {
  assertParkingSpotAvailable,
  parkingSpotOccupancyPredicate,
  parkingSpotPredicate,
  parkingZonePredicate,
  requireCompatibleParkingSpot,
} from "./parking-spot-availability";
import type {
  LockedConfirmSession,
  LockedParkingSpot,
  LockedParkingTarget,
} from "./confirm-parked-types";

function unavailable(): never {
  throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
}

export async function lockConfirmParkingSpot(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  parkingSpotCode: string,
  parkingSpotId?: string,
): Promise<LockedParkingSpot> {
  const spotResult = await transaction.query<LockedParkingSpot>(
    `SELECT spot.id::text, spot.code, spot.parking_zone_id::text
     FROM parking_spots AS spot
     WHERE ${parkingSpotPredicate}
     FOR UPDATE`,
    [
      session.organization_id,
      session.location_id,
      parkingSpotCode,
      parkingSpotId ?? null,
    ],
  );
  const spot = requireCompatibleParkingSpot(session, spotResult.rows[0]);
  const zoneResult = await transaction.query<{ id: string }>(
    `SELECT zone.id::text FROM parking_zones AS zone
     INNER JOIN parking_spots AS spot ON ${parkingZonePredicate}
     WHERE spot.id = $1 AND spot.organization_id = $2 AND spot.location_id = $3
     FOR UPDATE OF zone`,
    [spot.id, session.organization_id, session.location_id],
  );
  if (zoneResult.rows[0] === undefined) unavailable();
  const occupancy = await transaction.query<{ id: string }>(
    `SELECT occupant.id::text FROM valet_sessions AS occupant
     WHERE ${parkingSpotOccupancyPredicate("$3", "$4")}
     LIMIT 1`,
    [session.organization_id, session.location_id, spot.id, session.id],
  );
  assertParkingSpotAvailable(true, occupancy.rows[0] !== undefined);
  return spot;
}

export async function lockConfirmParkingZone(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  parkingZoneCode: string,
): Promise<LockedParkingTarget> {
  const result = await transaction.query<{ id: string }>(
    `SELECT id::text FROM parking_zones
     WHERE organization_id = $1 AND location_id = $2 AND code = $3
       AND status = 'ACTIVE' FOR UPDATE`,
    [session.organization_id, session.location_id, parkingZoneCode],
  );
  const parkingZoneId = result.rows[0]?.id;
  if (parkingZoneId === undefined) unavailable();
  if (
    session.parking_zone_id !== null &&
    session.parking_zone_id !== parkingZoneId
  ) {
    unavailable();
  }
  return { parkingSpotCode: null, parkingSpotId: null, parkingZoneId };
}

export function parkingSpotTarget(
  spot: LockedParkingSpot,
): LockedParkingTarget {
  return {
    parkingSpotCode: spot.code,
    parkingSpotId: spot.id,
    parkingZoneId: spot.parking_zone_id,
  };
}
