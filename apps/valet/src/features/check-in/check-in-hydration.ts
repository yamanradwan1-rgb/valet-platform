import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchSessionDetail } from "./check-in-api";
import type {
  CheckInActiveSession,
  CheckInFlowStep,
} from "./check-in-types";

export interface HydrationResult {
  readonly activeSession: CheckInActiveSession;
  readonly step: CheckInFlowStep;
}

function buildActiveSessionFromDetail(
  detail: StaffValetSessionDetailResponse,
  locationId: string,
): HydrationResult {
  if (detail.state === "CHECKING_IN") {
    const activeSession: CheckInActiveSession = {
      conditionCompletedAt: detail.checkIn.conditionCompletedAt,
      customerPhone: null,
      keySlotCode: null,
      locationId,
      parkingTaskId: null,
      parkingTaskVersion: null,
      sessionId: detail.sessionId,
      sessionVersion: detail.version,
      state: "CHECKING_IN",
      vehicle: {
        color: detail.vehicle.color,
        make: detail.vehicle.make,
        model: detail.vehicle.model,
        plateCountry: detail.vehicle.plateCountry ?? "JO",
        plateNumberRaw: detail.vehicle.plateNumberRaw ?? "",
        temporaryDescriptor: detail.vehicle.temporaryDescriptor,
      },
      vehicleUpdatedAt: detail.vehicle.vehicleUpdatedAt,
    };
    return { activeSession, step: "vehicle-condition" };
  }

  if (detail.state === "AWAITING_PARKING") {
    if (!detail.checkIn.conditionCompletedAt) {
      throw new Error(
        "Session in AWAITING_PARKING is missing authoritative conditionCompletedAt.",
      );
    }
    const activeSession: CheckInActiveSession = {
      conditionCompletedAt: detail.checkIn.conditionCompletedAt,
      customerPhone: null,
      keySlotCode: detail.keySlot?.code ?? null,
      locationId,
      parkingTaskId: null,
      parkingTaskVersion: null,
      sessionId: detail.sessionId,
      sessionVersion: detail.version,
      state: "AWAITING_PARKING",
      vehicle: {
        color: detail.vehicle.color,
        make: detail.vehicle.make,
        model: detail.vehicle.model,
        plateCountry: detail.vehicle.plateCountry ?? "JO",
        plateNumberRaw: detail.vehicle.plateNumberRaw ?? "",
        temporaryDescriptor: detail.vehicle.temporaryDescriptor,
      },
      vehicleUpdatedAt: detail.vehicle.vehicleUpdatedAt,
    };
    // DEC-068 §5: hydration treats a persisted NULL key_slot_id on an
    // AWAITING_PARKING session as ready for the Parking Task step; no
    // pre-Parking Key Slot step exists on the normal path.
    return { activeSession, step: "parking-task" };
  }

  throw new Error(
    `Session has advanced to state ${detail.state}. Please refresh discovery.`,
  );
}

export async function hydrateDraftSession(
  client: EmployeeApiClient,
  locationId: string,
  draft: StaffCheckInDraftSummary,
): Promise<HydrationResult> {
  const detail = await fetchSessionDetail(client, draft.sessionId);
  return buildActiveSessionFromDetail(detail, locationId);
}

export async function hydrateContinuationSession(
  client: EmployeeApiClient,
  locationId: string,
  continuation: StaffCheckInContinuationSummary,
): Promise<HydrationResult> {
  const detail = await fetchSessionDetail(client, continuation.sessionId);
  return buildActiveSessionFromDetail(detail, locationId);
}
