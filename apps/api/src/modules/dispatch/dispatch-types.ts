import type { StaffTaskQueueItem } from "@valet/contracts";

import { DispatchOperationError } from "./dispatch-errors";

export type OperationalTaskStatus =
  "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";

export interface LockedTaskRow {
  readonly created_at: Date;
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly status: OperationalTaskStatus | "COMPLETED" | "CANCELLED";
  readonly task_type: "PARKING" | "RETRIEVAL";
  readonly updated_at: Date;
  readonly valet_session_id: string;
  readonly version: number;
}

export interface AuthorizedTaskActor {
  readonly membershipId: string;
  readonly role: string;
}

export interface TaskProjection {
  readonly createdAt: string;
  readonly currentAssigneeMembershipId: string | null;
  readonly sessionId: string;
  readonly status: OperationalTaskStatus;
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly version: number;
}

export interface StaffTaskQueueItemRow {
  readonly created_at: Date;
  readonly current_assignee_membership_id: string | null;
  readonly id: string;
  readonly location_id: string;
  readonly organization_id: string;
  readonly parking_spot_label: string | null;
  readonly parking_zone_label: string | null;
  readonly retrieval_requested_at: Date | null;
  readonly session_parking_spot_id: string | null;
  readonly session_parking_zone_id: string | null;
  readonly status: OperationalTaskStatus | "COMPLETED" | "CANCELLED";
  readonly task_type: "PARKING" | "RETRIEVAL";
  readonly updated_at: Date;
  readonly valet_session_id: string;
  readonly vehicle_color: string | null;
  readonly vehicle_make: string | null;
  readonly vehicle_model: string | null;
  readonly vehicle_plate_number_raw: string | null;
  readonly vehicle_temporary_descriptor: string | null;
  readonly version: number;
}

export function toTaskProjection(task: LockedTaskRow): TaskProjection {
  if (
    (task.task_type !== "PARKING" && task.task_type !== "RETRIEVAL") ||
    task.status === "COMPLETED" ||
    task.status === "CANCELLED"
  ) {
    throw new Error("Task is outside the operational task projection.");
  }
  return {
    createdAt: task.created_at.toISOString(),
    currentAssigneeMembershipId: task.current_assignee_membership_id,
    sessionId: task.valet_session_id,
    status: task.status,
    taskId: task.id,
    taskType: task.task_type,
    version: task.version,
  };
}

export function toStaffTaskQueueItem(
  row: StaffTaskQueueItemRow,
): StaffTaskQueueItem {
  if (
    (row.task_type !== "PARKING" && row.task_type !== "RETRIEVAL") ||
    row.status === "COMPLETED" ||
    row.status === "CANCELLED"
  ) {
    throw new Error("Task is outside the operational task projection.");
  }
  if (
    (row.session_parking_zone_id !== null && row.parking_zone_label === null) ||
    (row.session_parking_spot_id !== null && row.parking_spot_label === null)
  ) {
    throw new DispatchOperationError("TASK_NOT_FOUND_OR_FORBIDDEN");
  }
  return {
    createdAt: row.created_at.toISOString(),
    currentAssigneeMembershipId: row.current_assignee_membership_id,
    parkingSpot: row.parking_spot_label,
    parkingZone: row.parking_zone_label,
    retrievalRequestedAt: row.retrieval_requested_at?.toISOString() ?? null,
    sessionId: row.valet_session_id,
    status: row.status,
    taskId: row.id,
    taskType: row.task_type,
    vehicle: {
      color: row.vehicle_color,
      make: row.vehicle_make,
      model: row.vehicle_model,
      plateNumberRaw: row.vehicle_plate_number_raw,
      temporaryDescriptor: row.vehicle_temporary_descriptor,
    },
    version: row.version,
  };
}
