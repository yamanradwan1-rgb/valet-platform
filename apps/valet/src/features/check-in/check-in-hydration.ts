import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
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

export async function hydrateDraftSession(
  client: EmployeeApiClient,
  locationId: string,
  draft: StaffCheckInDraftSummary,
): Promise<HydrationResult> {
  const detail = await fetchSessionDetail(client, draft.sessionId);
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

  // CHECKING_IN draft must complete check-in before reaching key assignment
  const step: CheckInFlowStep = "vehicle-condition";

  return { activeSession, step };
}

export async function hydrateContinuationSession(
  client: EmployeeApiClient,
  locationId: string,
  continuation: StaffCheckInContinuationSummary,
): Promise<HydrationResult> {
  const detail = await fetchSessionDetail(client, continuation.sessionId);
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

  const step: CheckInFlowStep =
    detail.keySlot?.code != null ? "parking-task" : "key-scan";

  return { activeSession, step };
}
