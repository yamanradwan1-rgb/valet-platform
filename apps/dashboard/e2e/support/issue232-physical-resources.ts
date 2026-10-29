import type { Request } from "@playwright/test";

import { LOCATION_A } from "./dashboard-api-fixture";

const at = "2026-09-29T03:00:00.000Z";
export const ISSUE232_KEY_ID = "11111111-1111-4111-8111-111111111111";
export const ISSUE232_SPOT_ID = "22222222-2222-4222-8222-222222222222";
export const ISSUE232_ZONE_ID = "33333333-3333-4333-8333-333333333333";

interface KeySlotItem {
  readonly keySlotId: string;
  readonly code: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ParkingSpotItem {
  readonly parkingSpotId: string;
  readonly code: string;
  readonly label: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly parkingZone: typeof zone;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const zone = {
  parkingZoneId: ISSUE232_ZONE_ID,
  code: "ZA",
  label: "Zone A",
  status: "ACTIVE" as const,
};

function label(kind: "key-slot" | "parking-spot", id: string, code: string) {
  return {
    resourceType: kind === "key-slot" ? "KEY_SLOT" : "PARKING_SPOT",
    resourceId: id,
    code,
    version: "V2",
    qrPayload: `vaylet:v2:${kind}:${id}:${code}`,
    location: {
      locationId: LOCATION_A.locationId,
      name: LOCATION_A.name,
      code: LOCATION_A.code,
    },
  };
}

export class Issue232PhysicalState {
  readonly keySlots: KeySlotItem[] = [];
  readonly parkingSpots: ParkingSpotItem[] = [];
  readonly keyPostBodies: unknown[] = [];
  readonly spotPostBodies: unknown[] = [];
  private readonly keyOperations = new Map<string, KeySlotItem>();
  private readonly spotOperations = new Map<string, ParkingSpotItem>();
  failNextKeyPost401 = false;

  constructor(populated = true) {
    if (populated) {
      this.keySlots.push({
        keySlotId: ISSUE232_KEY_ID,
        code: "K-01",
        status: "ACTIVE",
        createdAt: at,
        updatedAt: at,
      });
      this.parkingSpots.push({
        parkingSpotId: ISSUE232_SPOT_ID,
        code: "P-01",
        label: "Front Row 01",
        status: "ACTIVE",
        parkingZone: zone,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  reply(path: string, request: Request) {
    const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources`;
    if (path === `${base}/overview`) {
      const activeKeys = this.keySlots.filter((item) => item.status === "ACTIVE").length;
      const activeSpots = this.parkingSpots.filter((item) => item.status === "ACTIVE").length;
      return { body: {
        counts: {
          keySlots: { configured: this.keySlots.length, active: activeKeys, available: activeKeys, inUse: 0, unknown: 0 },
          parkingSpots: { configured: this.parkingSpots.length, active: activeSpots, available: activeSpots, occupied: 0, unknown: 0 },
        },
        keySlots: {
          items: this.keySlots.map((item) => ({
            keySlotId: item.keySlotId, code: item.code, status: item.status, label: null,
            usage: item.status === "ACTIVE" ? "AVAILABLE" : "UNKNOWN",
            holdingSessionId: null, holdingVehicle: null,
          })),
          nextCursor: null,
        },
        parkingSpots: {
          items: this.parkingSpots.map((item) => ({ ...item,
            usage: item.status === "ACTIVE" ? "AVAILABLE" : "UNKNOWN", occupancy: null,
          })),
          nextCursor: null,
        },
      } };
    }
    if (path === `${base}/key-slots`) {
      if (request.method() === "GET") return { body: { items: this.keySlots, nextCursor: null } };
      this.keyPostBodies.push(request.postDataJSON());
      if (this.failNextKeyPost401) {
        this.failNextKeyPost401 = false;
        return { status: 401, body: { code: "STAFF_AUTHENTICATION_REQUIRED", message: "Expired", requestId: "issue232-401" } };
      }
      const input = request.postDataJSON() as { code: string; operationId: string };
      const code = input.code.trim();
      const replay = this.keyOperations.get(input.operationId);
      if (replay) return { status: 201, body: replay };
      const existing = this.keySlots.find((item) => item.code === code);
      if (existing) return { status: 409, body: { code: "RESOURCE_CODE_CONFLICT", message: "Duplicate", requestId: "issue232-duplicate" } };
      const item = { keySlotId: "44444444-4444-4444-8444-444444444444", code, status: "ACTIVE" as const, createdAt: at, updatedAt: at };
      this.keySlots.push(item);
      this.keyOperations.set(input.operationId, item);
      return { status: 201, body: item };
    }
    if (path === `${base}/parking-spots`) {
      if (request.method() === "GET") return { body: { items: this.parkingSpots, nextCursor: null } };
      this.spotPostBodies.push(request.postDataJSON());
      const input = request.postDataJSON() as { code: string; label: string; operationId: string; parkingZoneId: string };
      const replay = this.spotOperations.get(input.operationId);
      if (replay) return { status: 201, body: replay };
      const item = { parkingSpotId: "55555555-5555-4555-8555-555555555555", code: input.code.trim(), label: input.label.trim(), status: "ACTIVE" as const, parkingZone: zone, createdAt: at, updatedAt: at };
      this.parkingSpots.push(item);
      this.spotOperations.set(input.operationId, item);
      return { status: 201, body: item };
    }
    if (path === `${base}/parking-zones`) return { body: { items: [zone], nextCursor: null } };
    const keyLabel = path.match(new RegExp(`^${base}/key-slots/([^/]+)/label$`, "u"));
    if (keyLabel) {
      const item = this.keySlots.find((candidate) => candidate.keySlotId === keyLabel[1]);
      return item ? { body: label("key-slot", item.keySlotId, item.code) } : undefined;
    }
    const spotLabel = path.match(new RegExp(`^${base}/parking-spots/([^/]+)/label$`, "u"));
    if (spotLabel) {
      const item = this.parkingSpots.find((candidate) => candidate.parkingSpotId === spotLabel[1]);
      return item ? { body: label("parking-spot", item.parkingSpotId, item.code) } : undefined;
    }
    return undefined;
  }
}
