import type { Request } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  type FixtureReply,
} from "../e2e/support/dashboard-api-fixture";

type Family = "keys" | "spots";
type Location = "A" | "B";
type Resource = {
  code: string;
  active: boolean;
  busy: boolean;
  plate?: string;
  descriptor?: string;
  label?: string;
};

// Explicitly fictional, deterministic API payloads modelling the approved design.
// Independent of UI implementation and never loaded from production.
const locationA: Record<Family, Resource[]> = {
  keys: [
    { code: "K-01", active: true, busy: false },
    { code: "K-02", active: true, busy: true, plate: "DEMO 4821" },
    { code: "K-03", active: true, busy: true, descriptor: "Temporary vehicle · Silver sedan" },
    { code: "K-04", active: true, busy: false },
    { code: "K-05", active: false, busy: false },
    { code: "K-06", active: true, busy: true, plate: "DEMO 7634" },
    { code: "K-07", active: false, busy: false },
    { code: "K-08", active: true, busy: true },
  ],
  spots: [
    { code: "P-01", label: "Bay 01", active: true, busy: false },
    { code: "P-02", label: "Bay 02", active: true, busy: true, plate: "DEMO 4821" },
    { code: "P-03", label: "Bay 03", active: true, busy: true, descriptor: "Temporary vehicle · Silver sedan" },
    { code: "P-04", label: "Accessible Bay", active: false, busy: false },
    { code: "P-05", label: "Legacy Bay", active: true, busy: false },
    { code: "P-06", label: "Bay 06", active: true, busy: true, plate: "DEMO 7634" },
    { code: "P-07", label: "Overflow Bay", active: true, busy: false },
    { code: "P-08", label: "Side Bay", active: true, busy: true },
  ],
};
const locationB: Record<Family, Resource[]> = {
  keys: [
    { code: "K-11", active: true, busy: false },
    { code: "K-12", active: true, busy: true, plate: "DEMO 9076" },
    { code: "K-13", active: false, busy: false },
  ],
  spots: [
    { code: "P-11", label: "Event Bay 11", active: true, busy: false },
    { code: "P-12", label: "Event Bay 12", active: true, busy: true, plate: "DEMO 9076" },
    { code: "P-13", label: "Unassigned Bay", active: false, busy: false },
  ],
};

const stamp = "2026-10-20T00:00:00.000Z";
function id(location: Location, family: Family, ordinal: number) {
  const prefix = location === "A" ? "a" : "b";
  const segment = family === "keys" ? "1" : "2";
  return `${prefix}${segment}${String(ordinal).padStart(6, "0")}-1111-4111-8111-111111111111`;
}
const vehicle = (resource: Resource) => ({
  plateNumberNormalized: resource.plate ?? null,
  temporaryDescriptor: resource.descriptor ?? null,
});
function resources(location: Location) {
  return location === "A" ? locationA : locationB;
}
function keyItem(resource: Resource, index: number, location: Location) {
  return {
    keySlotId: id(location, "keys", index + 1), code: resource.code,
    status: resource.active ? "ACTIVE" : "INACTIVE",
    label: null,
    usage: !resource.active ? "UNKNOWN" : resource.busy ? "IN_USE" : "AVAILABLE",
    holdingSessionId: resource.busy ? id(location, "spots", index + 30) : null,
    holdingVehicle: resource.busy ? vehicle(resource) : null,
  };
}
function spotItem(resource: Resource, index: number, location: Location) {
  return {
    parkingSpotId: id(location, "spots", index + 1), code: resource.code,
    label: resource.label || resource.code,
    status: resource.active ? "ACTIVE" : "INACTIVE",
    usage: !resource.active ? "UNKNOWN" : resource.busy ? "OCCUPIED" : "AVAILABLE",
    createdAt: stamp, updatedAt: stamp,
    parkingZone: index === 4 ? null : {
      parkingZoneId: id(location, "spots", 29), code: "ZA", label: "Demo Zone", status: "ACTIVE",
    },
    occupancy: resource.active && resource.busy ? {
      sessionId: id(location, "spots", index + 30), sessionState: "PARKED", vehicle: vehicle(resource),
    } : resource.active ? null : undefined,
  };
}

export const ISSUE304_EXPECTED = {
  A: [6, 2, 4, 7, 3, 4],
  B: [2, 1, 1, 2, 1, 1],
} as const;

function counts(location: Location) {
  const total = resources(location);
  const count = (family: Family, active: boolean, busy?: boolean) =>
    total[family].filter((row) => row.active === active &&
      (busy === undefined || row.busy === busy)).length;
  return {
    keySlots: { configured: total.keys.length, active: count("keys", true),
      available: count("keys", true, false), inUse: count("keys", true, true),
      unknown: count("keys", false) },
    parkingSpots: { configured: total.spots.length, active: count("spots", true),
      available: count("spots", true, false), occupied: count("spots", true, true),
      unknown: count("spots", false) },
  };
}

export function fixtureData(location: Location, family: Family) {
  const entries = resources(location)[family];
  return entries.map((item, i) => family === "keys"
    ? keyItem(item, i, location) : spotItem(item, i, location));
}

export function issue304Fixture(options: {
  role?: "CA" | "LM" | "SUPERVISOR";
  readonly onRequest?: (path: string, request: Request) => FixtureReply | undefined;
  readonly paged?: boolean;
} = {}) {
  const { role = "CA", paged = false } = options;
  const isManager = role === "LM";
  const fixture = new DashboardApiFixture({
    ...(isManager ? {
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    } : {
      companyOrganizations: role === "CA" ? [ORG_A] : [],
      companyLocations: role === "CA" ? { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] } : {},
    }),
    override: (path, request) => {
      const custom = options.onRequest?.(path, request);
      if (custom) return custom;
      const location = path.includes(LOCATION_A.locationId) ? "A"
        : path.includes(LOCATION_B.locationId) ? "B" : null;
      if (!location) return undefined;
      if (request.method() !== "GET") return undefined;
      if (path.endsWith("/physical-resources/parking-zones")) {
        return { body: { items: [{
          parkingZoneId: id(location, "spots", 29),
          code: "ZA", label: "Demo Zone", status: "ACTIVE",
        }], nextCursor: null } };
      }
      const custody = path.match(/\/physical-resources\/key-slots\/([^/]+)\/custody$/u);
      if (custody) return { body: { items: [], hasMore: false } };
      const label = path.match(/\/physical-resources\/(key-slots|parking-spots)\/([^/]+)\/label$/u);
      if (label) {
        const family = label[1] === "key-slots" ? "keys" : "spots";
        const row = fixtureData(location, family).find((item) =>
          ("keySlotId" in item ? item.keySlotId : item.parkingSpotId) === label[2]);
        if (!row) return undefined;
        return { body: {
          resourceType: family === "keys" ? "KEY_SLOT" : "PARKING_SPOT",
          resourceId: label[2], code: row.code, version: "V2",
          qrPayload: `vaylet:v2:${family === "keys" ? "key-slot" : "parking-spot"}:${label[2]}:${row.code}`,
          location: { locationId: location === "A" ? LOCATION_A.locationId : LOCATION_B.locationId,
            name: location === "A" ? LOCATION_A.name : LOCATION_B.name,
            code: location === "A" ? LOCATION_A.code : LOCATION_B.code },
        } };
      }
      if (!path.endsWith("/physical-resources/overview")) return undefined;
      const search = new URL(request.url()).searchParams;
      const getPage = (family: Family, cursor: string | null) => {
        const all = fixtureData(location, family);
        return { items: paged ? all.slice(cursor ? 4 : 0, cursor ? undefined : 4) : all,
          nextCursor: paged && !cursor && all.length > 4 ? "issue304-next" : null };
      };
      return { body: { counts: counts(location),
        keySlots: getPage("keys", search.get("keyCursor")),
        parkingSpots: getPage("spots", search.get("spotCursor")) } };
    },
  });
  return fixture;
}
