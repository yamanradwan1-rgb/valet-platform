import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptParkingTask,
  assignParkingTask,
  assignSessionKeySlot,
  completeCheckInSession,
  completeConditionStep,
  createIntakeSession,
  createSessionConditionNote,
  queueSessionParkingTask,
  startParkingSession,
  updateSessionVehicleIdentity,
} from "./check-in-api";
import type {
  CheckInActiveSession,
  CheckInVehicleData,
  StartParkingPayload,
} from "./check-in-types";

function generateUuid(): string {
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
  customerPhone?: string | null,
): Promise<CheckInActiveSession> {
  const phoneVal = customerPhone?.trim() || "";
  const intakeRes = await createIntakeSession(client, {
    intakeOperationId: generateUuid(),
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
  const note = conditionNote?.trim() || "";
  if (note && note !== "No visible issue") {
    await createSessionConditionNote(client, session.sessionId, {
      content: note,
    });
  }
  const condRes = await completeConditionStep(client, session.sessionId);
  const completeRes = await completeCheckInSession(
    client,
    session.sessionId,
    session.sessionVersion,
  );
  return {
    conditionCompletedAt: condRes.completedAt,
    sessionVersion: completeRes.version,
  };
}

export async function runKeyAssignmentMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
  keySlotCode: string,
): Promise<{ keySlotCode: string | null; sessionVersion: number }> {
  const assignRes = await assignSessionKeySlot(
    client,
    session.sessionId,
    session.sessionVersion,
    keySlotCode,
  );
  return {
    keySlotCode: assignRes.keySlotCode,
    sessionVersion: assignRes.version,
  };
}

export async function runQueueParkingTaskMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
): Promise<{ taskId: string; version: number }> {
  const queueRes = await queueSessionParkingTask(client, session.sessionId);
  return {
    taskId: queueRes.taskId,
    version: queueRes.version,
  };
}

export async function runStartParkingMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
): Promise<StartParkingPayload> {
  let taskId = session.parkingTaskId;
  let taskVersion = session.parkingTaskVersion;

  if (!taskId || taskVersion === null) {
    const queueRes = await queueSessionParkingTask(client, session.sessionId);
    taskId = queueRes.taskId;
    taskVersion = queueRes.version;
  }

  if (!taskId || taskVersion === null) {
    throw new Error("Unable to obtain parking task.");
  }

  const assignRes = await assignParkingTask(client, taskId, taskVersion);
  const acceptRes = await acceptParkingTask(client, taskId, assignRes.version);
  const startRes = await startParkingSession(
    client,
    session.sessionId,
    session.sessionVersion,
    acceptRes.version,
  );

  return {
    keySlotCode: session.keySlotCode,
    locationId: session.locationId,
    parkingStartedAt: startRes.parkingStartedAt,
    sessionId: session.sessionId,
    sessionVersion: startRes.sessionVersion,
    taskId: startRes.taskId,
    taskVersion: startRes.taskVersion,
    vehicle: session.vehicle,
  };
}
