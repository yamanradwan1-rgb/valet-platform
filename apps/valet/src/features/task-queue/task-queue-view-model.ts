import type { StaffTaskQueueItem } from "@valet/contracts";
import type { BadgeVariant } from "../../types/employee-ui";

export interface StaffTaskQueueItemViewModel {
  readonly taskId: string;
  readonly sessionId: string;
  readonly taskType: "PARKING" | "RETRIEVAL";
  readonly badgeVariant: BadgeVariant;
  readonly status: "QUEUED" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS";
  readonly vehicleHeading: string;
  readonly vehicleIdentifier: string;
  readonly vehicleColor?: string | undefined;
  readonly timeText: string;
  readonly elapsedAge: string;
  readonly parkingContext: string | null;
  readonly metaText: string;
  readonly isAssignedToMe: boolean;
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
    taskId: task.taskId,
    sessionId: task.sessionId,
    taskType: task.taskType,
    badgeVariant: task.taskType === "PARKING" ? "parking" : "retrieval",
    status: task.status,
    vehicleHeading,
    vehicleIdentifier,
    vehicleColor: task.vehicle.color?.trim() || undefined,
    timeText,
    elapsedAge: formatElapsedAge(task.createdAt, nowMs),
    parkingContext,
    metaText,
    isAssignedToMe,
    version: task.version,
  };
}
