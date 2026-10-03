import type { PostgresTransaction } from "../../common/database/postgres";
import {
  loadDirectoryKeySlots,
  loadDirectoryParking,
  loadDirectoryVehicles,
  loadDirectoryZones,
} from "./staff-vehicle-directory.queries";
import type {
  DirectoryCandidateRow,
  DirectoryVehicleRow,
} from "./staff-vehicle-directory.queries";

export function requireVehicle(
  vehicles: Map<string, DirectoryVehicleRow>,
  candidate: DirectoryCandidateRow,
) {
  const vehicle = vehicles.get(candidate.vehicle_id);
  if (vehicle === undefined) {
    throw new Error("Corrupted state: referenced vehicle missing.");
  }
  return vehicle;
}

export function toVehicleProjection(vehicle: {
  color: string | null;
  make: string | null;
  model: string | null;
  plate_country: string | null;
  plate_number_raw: string | null;
  temporary_descriptor: string | null;
}) {
  return {
    color: vehicle.color,
    make: vehicle.make,
    model: vehicle.model,
    plateCountry: vehicle.plate_country,
    plateNumberRaw: vehicle.plate_number_raw,
    temporaryDescriptor: vehicle.temporary_descriptor,
  };
}

export async function loadDirectoryProjections(
  client: PostgresTransaction,
  candidates: readonly DirectoryCandidateRow[],
  scope: { readonly locationId: string; readonly organizationId: string },
) {
  const vehicleIds = candidates.map((candidate) => candidate.vehicle_id);
  const spotIds = candidates
    .map((candidate) => candidate.parking_spot_id)
    .filter((spotId): spotId is string => spotId !== null);
  const zoneIds = candidates
    .map((candidate) => candidate.parking_zone_id)
    .filter((zoneId): zoneId is string => zoneId !== null);
  const slotIds = candidates
    .map((candidate) => candidate.key_slot_id)
    .filter((slotId): slotId is string => slotId !== null);
  return {
    keySlots: await loadDirectoryKeySlots(
      client,
      scope.organizationId,
      scope.locationId,
      slotIds,
    ),
    parking: await loadDirectoryParking(
      client,
      scope.organizationId,
      scope.locationId,
      spotIds,
    ),
    zones: await loadDirectoryZones(
      client,
      scope.organizationId,
      scope.locationId,
      zoneIds,
    ),
    vehicles: await loadDirectoryVehicles(
      client,
      scope.organizationId,
      vehicleIds,
    ),
  };
}
