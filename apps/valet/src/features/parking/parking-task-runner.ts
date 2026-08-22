import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptParkingTask,
  assignParkingTask,
  fetchSessionDetail,
  startParkingSession,
} from "./parking-api";
import type { StartParkingPayload } from "../check-in/check-in-types";

export type ParkingTaskActionResult =
  | { readonly kind: "DENIED" }
  | {
      readonly kind: "NAVIGATE_IN_PROGRESS";
      readonly sessionId: string;
      readonly taskId: string;
      readonly version: number;
    }
  | {
      readonly kind: "START_PARKING_SUCCESS";
      readonly payload: StartParkingPayload;
    };

export async function executeParkingTaskAction(
  client: EmployeeApiClient,
  task: {
    readonly currentAssigneeMembershipId: string | null;
    readonly sessionId: string;
    readonly status: "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";
    readonly taskId: string;
    readonly version: number;
  },
  currentMembershipId?: string,
): Promise<ParkingTaskActionResult> {
  const isAssignedToOther =
    task.currentAssigneeMembershipId !== null &&
    currentMembershipId !== undefined &&
    task.currentAssigneeMembershipId !== currentMembershipId;

  if (isAssignedToOther) {
    return { kind: "DENIED" };
  }

  if (task.status === "IN_PROGRESS") {
    return {
      kind: "NAVIGATE_IN_PROGRESS",
      sessionId: task.sessionId,
      taskId: task.taskId,
      version: task.version,
    };
  }

  const detail = await fetchSessionDetail(client, task.sessionId);
  let currentTaskVersion = task.version;

  if (task.status === "QUEUED") {
    const assignRes = await assignParkingTask(client, task.taskId, currentTaskVersion);
    currentTaskVersion = assignRes.version;
    const acceptRes = await acceptParkingTask(client, task.taskId, currentTaskVersion);
    currentTaskVersion = acceptRes.version;
  } else if (task.status === "ASSIGNED") {
    const acceptRes = await acceptParkingTask(client, task.taskId, currentTaskVersion);
    currentTaskVersion = acceptRes.version;
  }

  const startRes = await startParkingSession(
    client,
    task.sessionId,
    detail.version,
    currentTaskVersion,
  );

  return {
    kind: "START_PARKING_SUCCESS",
    payload: {
      keySlotCode: detail.keySlot?.code ?? null,
      locationId: detail.locationId,
      parkingStartedAt: startRes.parkingStartedAt,
      sessionId: task.sessionId,
      sessionVersion: startRes.sessionVersion,
      taskId: startRes.taskId,
      taskVersion: startRes.taskVersion,
      vehicle: {
        color: detail.vehicle.color,
        make: detail.vehicle.make,
        model: detail.vehicle.model,
        plateCountry: detail.vehicle.plateCountry ?? "JO",
        plateNumberRaw: detail.vehicle.plateNumberRaw ?? "",
        temporaryDescriptor: detail.vehicle.temporaryDescriptor,
      },
    },
  };
}
