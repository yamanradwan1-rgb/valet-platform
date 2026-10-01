import { createHash } from "node:crypto";
import type {
  CreateKeySlotRequest,
  CreateParkingSpotRequest,
  CreateParkingZoneRequest,
} from "@valet/contracts";

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function parkingZoneCreateFingerprint(
  locationId: string,
  request: CreateParkingZoneRequest,
): string {
  return fingerprint({
    kind: "PARKING_ZONE",
    locationId,
    code: request.code,
    label: request.label,
  });
}

export function keySlotCreateFingerprint(
  locationId: string,
  request: CreateKeySlotRequest,
): string {
  return fingerprint({
    kind: "KEY_SLOT",
    locationId,
    code: request.code,
  });
}

export function parkingSpotCreateFingerprint(
  locationId: string,
  request: CreateParkingSpotRequest,
): string {
  return fingerprint({
    kind: "PARKING_SPOT",
    locationId,
    code: request.code,
    label: request.label,
    parkingZoneId: request.parkingZoneId,
  });
}
