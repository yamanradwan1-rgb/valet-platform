import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { ActiveRetrievalSession, RetrievalFlowStep } from "./retrieval-types";

export function retrievalErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function retrievalInitialStep(state?: string): RetrievalFlowStep {
  if (state === "RETRIEVING") return "in-progress";
  if (state === "READY") return "vehicle-ready";
  if (state === "HANDOFF_PENDING") return "handoff";
  if (state === "COMPLETED") return "handoff-completed";
  return "key-checkout";
}

const validStatusMap = {
  COMPLETED: "COMPLETED",
  HANDOFF_PENDING: "IN_PROGRESS",
  READY: "IN_PROGRESS",
  REQUESTED: "ACCEPTED",
  RETRIEVING: "IN_PROGRESS",
} as const;

export function expectedRetrievalTaskStatus(
  state: keyof typeof validStatusMap,
) {
  return validStatusMap[state];
}

export function createActiveRetrievalSession(
  detail: StaffValetSessionDetailResponse,
  state: ActiveRetrievalSession["state"],
  taskId: string,
  taskVersion: number,
  taskStatus: ActiveRetrievalSession["taskStatus"],
): ActiveRetrievalSession {
  return {
    expectedKeySlotCode: detail.keySlot?.code ?? null,
    expectedKeySlotId: detail.keySlot?.keySlotId ?? null,
    handoff: detail.handoff,
    isKeyConfirmed: false,
    locationId: detail.locationId,
    parkingSpotCode: detail.parking.parkingSpotCode,
    parkingZoneCode: detail.parking.parkingZoneCode,
    readyAt: null,
    retrievalStartedAt: null,
    sessionId: detail.sessionId,
    sessionVersion: detail.version,
    state,
    taskId,
    taskStatus,
    taskVersion,
    verifiedKeySlotCode: null,
    verifiedKeySlotId: null,
    vehicle: {
      color: detail.vehicle.color,
      make: detail.vehicle.make,
      model: detail.vehicle.model,
      plateCountry: detail.vehicle.plateCountry,
      plateNumberRaw: detail.vehicle.plateNumberRaw,
      temporaryDescriptor: detail.vehicle.temporaryDescriptor,
    },
  };
}
