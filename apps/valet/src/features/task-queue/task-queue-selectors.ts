import type { StaffTaskQueueItem } from "@valet/contracts";

import type { StaffAuthStatus } from "../../lib/auth/staff-auth-types";
import type { TaskQueueState } from "./task-queue-controller";

export function selectEffectiveTaskQueueItems(
  status: StaffAuthStatus,
  sessionGeneration: number,
  locationId: string | null,
  controllerState: TaskQueueState,
): StaffTaskQueueItem[] {
  if (
    status !== "authenticated" ||
    !locationId ||
    controllerState.sessionGeneration !== sessionGeneration ||
    controllerState.scopeLocationId !== locationId
  ) {
    return [];
  }
  return controllerState.tasks;
}
