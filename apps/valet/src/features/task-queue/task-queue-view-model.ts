import type { StaffTaskQueueItem } from "@valet/contracts";
import type { BadgeVariant } from "../../types/employee-ui";

export interface StaffTaskQueueItemViewModel {
  readonly badgeVariant: BadgeVariant;
  readonly currentAssigneeMembershipId: string | null;
  readonly elapsedAge: string;
  readonly isAssignedToMe: boolean;
  readonly metaText: string;
  readonly parkingContext: string | null;
  readonly sessionId: string;
  readonly status: "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";
  readonly taskId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly timeText: string;
  readonly vehicleColor?: string | undefined;
  readonly vehicleHeading: string;
  readonly vehicleIdentifier: string;
  readonly version: number;
}

export function formatElapsedAge(
  createdAtIso: string,
  nowMs: number = Date.now(),
): string {
  const createdMs = new Date(createdAtIso).getTime();
  const elapsedSec = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  const m = Math.floor(elapsedSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsedSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatRelativeMinutesAgo(
  timestampIso: string,
  prefix: "Requested" | "Queued",
  nowMs: number = Date.now(),
): string {
  const timeMs = new Date(timestampIso).getTime();
  const minutes = Math.floor(Math.max(0, nowMs - timeMs) / 60000);
  if (minutes < 1) {
    return `${prefix} just now`;
  }
  if (minutes === 1) {
    return `${prefix} 1 min ago`;
  }
  return `${prefix} ${minutes} min ago`;
}

export function toStaffTaskQueueItemViewModel(
  task: StaffTaskQueueItem,
  myMembershipId?: string | undefined,
  nowMs: number = Date.now(),
): StaffTaskQueueItemViewModel {
  const make = task.vehicle.make?.trim() ?? "";
  const model = task.vehicle.model?.trim() ?? "";
  const descriptor = task.vehicle.temporaryDescriptor?.trim() ?? "";

  let vehicleHeading = "";
  if (make && model) {
    vehicleHeading = `${make} ${model}`;
  } else if (make) {
    vehicleHeading = make;
  } else if (model) {
    vehicleHeading = model;
  } else if (descriptor) {
    vehicleHeading = descriptor;
  }

  let vehicleIdentifier = "";
  const plate = task.vehicle.plateNumberRaw?.trim() ?? "";
  if (plate) {
    vehicleIdentifier = plate;
  } else if (descriptor) {
    vehicleIdentifier = descriptor;
  }

  let timeText = "";
  if (task.taskType === "RETRIEVAL") {
    if (task.retrievalRequestedAt !== null) {
      timeText = formatRelativeMinutesAgo(
        task.retrievalRequestedAt,
        "Requested",
        nowMs,
      );
    } else {
      timeText = formatRelativeMinutesAgo(task.createdAt, "Queued", nowMs);
    }
  } else {
    timeText = formatRelativeMinutesAgo(task.createdAt, "Queued", nowMs);
  }

  const zone = task.parkingZone?.trim() ?? "";
  const spot = task.parkingSpot?.trim() ?? "";
  let parkingContext: string | null = null;
  if (zone && spot) {
    parkingContext = `${zone} · ${spot}`;
  } else if (zone) {
    parkingContext = zone;
  } else if (spot) {
    parkingContext = spot;
  }

  const metaText = parkingContext ?? task.status;
  const isAssignedToMe = Boolean(
    myMembershipId &&
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId === myMembershipId,
  );

  return {
    badgeVariant: task.taskType === "PARKING" ? "parking" : "retrieval",
    currentAssigneeMembershipId: task.currentAssigneeMembershipId,
    elapsedAge: formatElapsedAge(task.createdAt, nowMs),
    isAssignedToMe,
    metaText,
    parkingContext,
    sessionId: task.sessionId,
    status: task.status,
    taskId: task.taskId,
    taskType: task.taskType,
    timeText,
    vehicleColor: task.vehicle.color?.trim() || undefined,
    vehicleHeading,
    vehicleIdentifier,
    version: task.version,
  };
}
