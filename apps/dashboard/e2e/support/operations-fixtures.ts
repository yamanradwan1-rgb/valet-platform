import type { FixtureReply } from "./dashboard-api-fixture";
import { E2E_IDS, LOCATION_A } from "./dashboard-api-fixture";

export const OP_IDS = {
  session: "77777777-7777-4777-8777-777777777701",
  vehicle: "77777777-7777-4777-8777-777777777702",
  task: "77777777-7777-4777-8777-777777777703",
  retrieval: "77777777-7777-4777-8777-777777777704",
  keySlot: "77777777-7777-4777-8777-777777777705",
  incident: "77777777-7777-4777-8777-777777777706",
  tracker: "77777777-7777-4777-8777-777777777707",
  point: "77777777-7777-4777-8777-777777777708",
  area: "77777777-7777-4777-8777-777777777709",
} as const;

const now = "2026-09-21T12:00:00.000Z";

export function sessionItem(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: OP_IDS.session,
    state: "PARKED",
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: now,
    keySlotId: OP_IDS.keySlot,
    parkingSpotId: null,
    currentAssigneeMembershipId: E2E_IDS.membership,
    vehicle: {
      vehicleId: OP_IDS.vehicle,
      plateCountry: "JO",
      plateNumberNormalized: "12-34567",
      temporaryDescriptor: null,
    },
    ...overrides,
  };
}

export function stateCounts() {
  const counts = [
    ["AWAITING_PARKING", 1], ["CHECKING_IN", 1], ["COMPLETED", 50],
    ["HANDOFF_PENDING", 2], ["PARKED", 4], ["PARKING", 1],
    ["READY", 2], ["REQUESTED", 3], ["RETRIEVING", 1],
  ];
  return { counts: counts.map(([state, count]) => ({ state, count })) };
}

export function taskItem(overrides: Record<string, unknown> = {}) {
  return {
    taskId: OP_IDS.task,
    taskType: "PARKING",
    status: "IN_PROGRESS",
    valetSessionId: OP_IDS.session,
    currentAssigneeMembershipId: null,
    createdAt: "2026-09-21T10:30:00.000Z",
    updatedAt: now,
    ...overrides,
  };
}

export function retrievalItem() {
  return {
    requestId: OP_IDS.retrieval,
    valetSessionId: OP_IDS.session,
    requestedAt: "2026-09-21T11:30:00.000Z",
    status: "OPEN",
    requesterType: "CUSTOMER",
    task: { taskId: OP_IDS.task, status: "QUEUED", currentAssigneeMembershipId: null },
  };
}

export function keyItem() {
  return { keySlotId: OP_IDS.keySlot, code: "K-12", slotStatus: "ACTIVE", holdingSessionId: null };
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
      liveItem("STALE", 31.9542, 35.9110, "77777777-7777-4777-8777-777777777710"),
      {
        ...liveItem("LIVE", 31.9545, 35.9114, "77777777-7777-4777-8777-777777777711"),
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
      latitude, longitude, capturedAt: now, freshness,
      areas: [],
    },
  };
}

export function pointItem(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_IDS.point, code: "ENT", label: "Entrance", kind: "ENTRANCE",
    latitude: 31.9538, longitude: 35.9104, levelLabel: null, active: true,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

export function areaItem(overrides: Record<string, unknown> = {}) {
  return {
    id: OP_IDS.area, code: "P1", label: "Parking Area", purpose: "PARKING",
    levelLabel: null, parkingZoneId: null, active: true, createdAt: now, updatedAt: now,
    vertices: [
      { latitude: 31.9535, longitude: 35.9101, position: 0 },
      { latitude: 31.9540, longitude: 35.9101, position: 1 },
      { latitude: 31.9540, longitude: 35.9108, position: 2 },
    ],
    ...overrides,
  };
}

export function operationsReadReply(path: string): FixtureReply | undefined {
  const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
  if (path === `${base}/sessions`) return { body: { items: [sessionItem()], nextCursor: null } };
  if (path === `${base}/session-state-counts`) return { body: stateCounts() };
  if (path === `${base}/retrieval-queue`) return { body: { items: [retrievalItem()], nextCursor: null } };
  if (path === `${base}/tasks`) return { body: { items: [taskItem()], nextCursor: null } };
  if (path === `${base}/keys`) return { body: { items: [keyItem()], nextCursor: null } };
  if (path === `${base}/incidents`) return { body: { items: [incidentItem()], nextCursor: null } };
  if (path === `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`) return { body: liveMapBody() };
  return undefined;
}
