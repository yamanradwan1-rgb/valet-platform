import { E2E_IDS } from "./dashboard-api-fixture";
import { OP_IDS } from "./operations-fixture-identifiers";
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
    activeTask: null,
    keySlot: { resourceId: OP_IDS.keySlot, code: "K-12", label: null },
    parkingSpot: null,
    parkingZone: null,
    vehicle: {
      make: null,
      model: null,
      color: null,
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
    ["AWAITING_PARKING", 1],
    ["CHECKING_IN", 1],
    ["COMPLETED", 50],
    ["HANDOFF_PENDING", 2],
    ["PARKED", 4],
    ["PARKING", 1],
    ["READY", 2],
    ["REQUESTED", 3],
    ["RETRIEVING", 1],
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
    assignee: null,
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
    task: {
      taskId: OP_IDS.task,
      status: "QUEUED",
      currentAssigneeMembershipId: null,
    },
  };
}
