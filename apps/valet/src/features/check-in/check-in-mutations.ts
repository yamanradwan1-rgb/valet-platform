import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptParkingTask,
  assignSessionKeySlot,
  completeCheckInSession,
  completeConditionStep,
  createIntakeSession,
  queueSessionParkingTask,
  startParkingSession,
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

export async function runIntakeMutation(
  client: EmployeeApiClient,
  locationId: string,
  vehicleData: CheckInVehicleData,
): Promise<CheckInActiveSession> {
  const intakeRes = await createIntakeSession(client, {
    intakeOperationId: generateUuid(),
    targetLocationId: locationId,
    vehicleIdentity:
      vehicleData.temporaryDescriptor !== null &&
      vehicleData.plateNumberRaw.trim() === ""
        ? {
            mode: "TEMPORARY_DESCRIPTOR",
            temporaryDescriptor: vehicleData.temporaryDescriptor,
          }
        : {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: vehicleData.plateCountry,
            plateNumberRaw: vehicleData.plateNumberRaw,
          },
  });

  return {
    conditionCompletedAt: null,
    customerPhone: null,
    keySlotCode: null,
    locationId,
    parkingTaskId: null,
    parkingTaskVersion: null,
    sessionId: intakeRes.valetSessionId,
    sessionVersion: intakeRes.version,
    state: "CHECKING_IN",
    vehicle: vehicleData,
  };
}

export async function runConditionCompletionMutation(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
): Promise<{ conditionCompletedAt: string; sessionVersion: number }> {
  await completeConditionStep(client, session.sessionId);
  const completeRes = await completeCheckInSession(
    client,
    session.sessionId,
    session.sessionVersion,
  );
  return {
    conditionCompletedAt: new Date().toISOString(),
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

  await acceptParkingTask(client, taskId, taskVersion);
  const startRes = await startParkingSession(
    client,
    session.sessionId,
    session.sessionVersion,
    taskVersion,
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
