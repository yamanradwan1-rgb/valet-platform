import { createHash } from "node:crypto";
import type {
  CreateKeySlotRequest,
  CreateParkingSpotRequest,
} from "@valet/contracts";

function fingerprint(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
