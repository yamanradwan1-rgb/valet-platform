import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { executeParkingTaskAction } from "../parking/parking-task-runner";
import {
  completeCheckInSession,
  completeConditionStep,
  createIntakeSession,
  createSessionConditionNote,
  fetchSessionDetail,
  queueSessionParkingTask,
  updateSessionVehicleIdentity,
} from "./check-in-api";
import type {
  CheckInActiveSession,
  CheckInVehicleData,
  StartParkingPayload,
} from "./check-in-types";

export function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildIdentityInput(vehicleData: CheckInVehicleData) {
  if (
    vehicleData.temporaryDescriptor !== null &&
    vehicleData.plateNumberRaw.trim() === ""
  ) {
    return {
      mode: "TEMPORARY_DESCRIPTOR" as const,
      temporaryDescriptor: vehicleData.temporaryDescriptor,
    };
  }
  return {
    confirmedByHuman: true,
    mode: "CONFIRMED_PLATE" as const,
    plateCountry: vehicleData.plateCountry,
    plateNumberRaw: vehicleData.plateNumberRaw,
  };
}

export async function runIntakeMutation(
  client: EmployeeApiClient,
  locationId: string,
  vehicleData: CheckInVehicleData,
  customerPhone: string | null | undefined,
  intakeOperationId: string,
): Promise<CheckInActiveSession> {
  const phoneVal = customerPhone?.trim() || "";
  const intakeRes = await createIntakeSession(client, {
    intakeOperationId,
    targetLocationId: locationId,
    vehicleIdentity: buildIdentityInput(vehicleData),
    ...(phoneVal ? { customer: { phone: phoneVal } } : {}),
  });

  return {
    conditionCompletedAt: null,
    customerPhone: phoneVal || null,
    keySlotCode: null,
    locationId,
    parkingTaskId: null,
    parkingTaskVersion: null,
    sessionId: intakeRes.valetSessionId,
    sessionVersion: intakeRes.version,
    state: "CHECKING_IN",
    vehicle: vehicleData,
    vehicleUpdatedAt: intakeRes.vehicleUpdatedAt,
  };
}

export async function runUpdateVehicleIdentityMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
  newVehicleData: CheckInVehicleData,
): Promise<{ vehicle: CheckInVehicleData; vehicleUpdatedAt: string }> {
  if (session.state !== "CHECKING_IN") {
    throw new Error("Vehicle identity cannot be modified after check-in is complete.");
  }
  if (!session.vehicleUpdatedAt) {
    throw new Error("Missing vehicleUpdatedAt on session.");
  }
  const res = await updateSessionVehicleIdentity(client, session.sessionId, {
    expectedVehicleUpdatedAt: session.vehicleUpdatedAt,
    identity: buildIdentityInput(newVehicleData),
  });
  return {
    vehicle: newVehicleData,
    vehicleUpdatedAt: res.vehicleUpdatedAt,
  };
}

export async function runConditionCompletionMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
  conditionNote?: string | null,
): Promise<{ conditionCompletedAt: string; sessionVersion: number }> {
  if (session.state === "AWAITING_PARKING") {
    if (!session.conditionCompletedAt) {
      throw new Error(
        "Missing authoritative conditionCompletedAt on AWAITING_PARKING session.",
      );
    }
    return {
      conditionCompletedAt: session.conditionCompletedAt,
      sessionVersion: session.sessionVersion,
    };
  }

  let conditionCompletedAt = session.conditionCompletedAt;

  if (!conditionCompletedAt) {
    const note = conditionNote?.trim() || "No visible issue";
    await createSessionConditionNote(client, session.sessionId, {
      content: note,
    });
    const condRes = await completeConditionStep(client, session.sessionId);
    conditionCompletedAt = condRes.completedAt;
  }

  const completeRes = await completeCheckInSession(
    client,
    session.sessionId,
    session.sessionVersion,
  );

  return {
    conditionCompletedAt,
    sessionVersion: completeRes.version,
  };
}

export async function runQueueParkingTaskMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
): Promise<{ currentAssigneeMembershipId: string | null; status: "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS"; taskId: string; version: number }> {
  const queueRes = await queueSessionParkingTask(client, session.sessionId);
  return {
    currentAssigneeMembershipId: queueRes.currentAssigneeMembershipId,
    status: queueRes.status,
    taskId: queueRes.taskId,
    version: queueRes.version,
  };
}

export async function runStartParkingMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
  membershipId?: string | null,
): Promise<StartParkingPayload> {
  const queueRes = await queueSessionParkingTask(client, session.sessionId);
  const taskInfo = {
    currentAssigneeMembershipId: queueRes.currentAssigneeMembershipId,
    sessionId: queueRes.sessionId,
    status: queueRes.status,
    taskId: queueRes.taskId,
    version: queueRes.version,
  };

  const result = await executeParkingTaskAction(
    client,
    taskInfo,
    membershipId ?? undefined,
  );
  if (result.kind === "START_PARKING_SUCCESS") {
    return result.payload;
  }
  if (result.kind === "NAVIGATE_IN_PROGRESS") {
    const detail = await fetchSessionDetail(client, session.sessionId);
    if (detail.state === "PARKING" && detail.parking.parkingStartedAt) {
      return {
        keySlotCode: detail.keySlot?.code ?? session.keySlotCode,
        locationId: detail.locationId,
        parkingStartedAt: detail.parking.parkingStartedAt,
        sessionId: session.sessionId,
        sessionVersion: detail.version,
        taskId: taskInfo.taskId,
        taskVersion: taskInfo.version,
        vehicle: session.vehicle,
      };
    }
    throw new Error("Session is not in active parking state.");
  }
  throw new Error("Parking task is assigned to another staff member.");
}
