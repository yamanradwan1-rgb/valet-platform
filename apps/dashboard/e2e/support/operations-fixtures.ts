import {
  sessionItem,
  stateCounts,
  taskItem,
  retrievalItem,
} from "./overview-fixtures";
export {
  sessionItem,
  stateCounts,
  taskItem,
  retrievalItem,
} from "./overview-fixtures";
import type { FixtureReply } from "./dashboard-api-fixture";
import { E2E_IDS, LOCATION_A } from "./dashboard-api-fixture";

import { OP_IDS } from "./operations-fixture-identifiers";
export { OP_IDS } from "./operations-fixture-identifiers";

const now = "2026-09-21T12:00:00.000Z";

export function keyItem() {
  return {
    keySlotId: OP_IDS.keySlot,
    code: "K-12",
    slotStatus: "ACTIVE",
    holdingSessionId: null,
    holdingVehicle: null,
  };
}

export function incidentItem() {
  return {
    incidentId: OP_IDS.incident,
    valetSessionId: OP_IDS.session,
    status: "INVESTIGATING",
    severity: "MEDIUM",
    type: "VEHICLE_DAMAGE",
    description: "Mirror inspection required",
    createdAt: "2026-09-21T11:00:00.000Z",
    resolvedAt: null,
  };
}

export function liveMapBody() {
  return {
    observedAt: now,
    nextCursor: null,
    items: [
      liveItem("LIVE", 31.9539, 35.9106),
      liveItem(
        "STALE",
        31.9542,
        35.911,
        "77777777-7777-4777-8777-777777777710",
      ),
      {
        ...liveItem(
          "LIVE",
          31.9545,
          35.9114,
          "77777777-7777-4777-8777-777777777711",
        ),
        position: null,
      },
    ],
  };
}

function liveItem(
  freshness: "LIVE" | "STALE",
  latitude: number,
  longitude: number,
  taskId = OP_IDS.task,
) {
  return {
    taskId,
    taskType: "PARKING",
    trackingSessionId: OP_IDS.tracker,
    valetSessionId: OP_IDS.session,
    assigneeMembershipId: E2E_IDS.membership,
    sessionState: "PARKING",
    vehicle: {
      vehicleId: OP_IDS.vehicle,
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumber: "12-34567",
      temporaryDescriptor: null,
    },
    position: {
      latitude,
      longitude,
      capturedAt: now,
      freshness,
      areas: [],
    },
  };
}

export function pointItem(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_IDS.point,
    code: "ENT",
    label: "Entrance",
    kind: "ENTRANCE",
    latitude: 31.9538,
    longitude: 35.9104,
    levelLabel: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function areaItem(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_IDS.area,
    code: "P1",
    label: "Parking Area",
    purpose: "PARKING",
    levelLabel: null,
    parkingZone: null,
    parkingZoneId: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    vertices: [
      { latitude: 31.9535, longitude: 35.9101, position: 0 },
      { latitude: 31.954, longitude: 35.9101, position: 1 },
      { latitude: 31.954, longitude: 35.9108, position: 2 },
    ],
    ...overrides,
  };
}

export function operationsReadReply(path: string): FixtureReply | undefined {
  const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
  if (path === `${base}/sessions`)
    return { body: { items: [sessionItem()], nextCursor: null } };
  if (path === `${base}/session-state-counts`) return { body: stateCounts() };
  if (path === `${base}/retrieval-queue`)
    return { body: { items: [retrievalItem()], nextCursor: null } };
  if (path === `${base}/tasks`)
    return { body: { items: [taskItem()], nextCursor: null } };
  if (path === `${base}/keys`)
    return { body: { items: [keyItem()], nextCursor: null } };
  if (path === `${base}/incidents`)
    return { body: { items: [incidentItem()], nextCursor: null } };
  if (
    path === `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`
  )
    return { body: liveMapBody() };
  return undefined;
}
