import type { PostgresTransaction } from "../../common/database/postgres";
import { ConfirmParkedError } from "./confirm-parked-errors";
import type {
  LockedConfirmSession,
  LockedParkingSpot,
} from "./confirm-parked-types";

function unavailable(): never {
  throw new ConfirmParkedError("PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE");
}

export async function lockConfirmParkingSpot(
  transaction: PostgresTransaction,
  session: LockedConfirmSession,
  parkingSpotCode: string,
): Promise<LockedParkingSpot> {
  const spotResult = await transaction.query<LockedParkingSpot>(
    `SELECT id::text, code, parking_zone_id::text
     FROM parking_spots
     WHERE organization_id = $1 AND location_id = $2 AND code = $3
       AND status = 'ACTIVE' AND parking_zone_id IS NOT NULL
     FOR UPDATE`,
    [session.organization_id, session.location_id, parkingSpotCode],
  );
  const spot = spotResult.rows[0];
  if (spot === undefined) unavailable();
  if (
    session.parking_zone_id !== null &&
    session.parking_zone_id !== spot.parking_zone_id
  ) {
    unavailable();
  }
  const zoneResult = await transaction.query<{ id: string }>(
    `SELECT id::text FROM parking_zones
     WHERE id = $1 AND organization_id = $2 AND location_id = $3
       AND status = 'ACTIVE' FOR UPDATE`,
    [spot.parking_zone_id, session.organization_id, session.location_id],
  );
  if (zoneResult.rows[0] === undefined) unavailable();
  const occupancy = await transaction.query<{ id: string }>(
    `SELECT id::text FROM valet_sessions
     WHERE organization_id = $1 AND location_id = $2
       AND parking_spot_id = $3 AND id <> $4
     LIMIT 1`,
    [session.organization_id, session.location_id, spot.id, session.id],
  );
  if (occupancy.rows[0] !== undefined) unavailable();
  return spot;
}
