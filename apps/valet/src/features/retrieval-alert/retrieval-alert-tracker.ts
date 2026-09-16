import type { StaffTaskQueueItem } from "@valet/contracts";

export interface RetrievalAlertTracker {
  readonly observedTaskIds: Set<string>;
  baselineEstablished: boolean;
  lastSnapshotCount: number;
}

export function createRetrievalAlertTracker(): RetrievalAlertTracker {
  return {
    baselineEstablished: false,
    lastSnapshotCount: 0,
    observedTaskIds: new Set<string>(),
  };
}

function isActionableRetrieval(task: StaffTaskQueueItem): boolean {
  return (
    task.taskType === "RETRIEVAL" &&
    task.status === "QUEUED" &&
    task.currentAssigneeMembershipId === null
  );
}

/**
 * Consumes each successful canonical queue snapshot once. Every visible Task
 * ID is remembered, including currently ineligible Tasks, so a later decline
 * or reassignment cannot turn an old Task into a new-request alert.
 */
export function observeRetrievalSnapshot(
  tracker: RetrievalAlertTracker,
  tasks: readonly StaffTaskQueueItem[],
  successfulSnapshotCount: number,
): string[] {
  if (
    successfulSnapshotCount <= 0 ||
    successfulSnapshotCount === tracker.lastSnapshotCount
  ) {
    return [];
  }
  tracker.lastSnapshotCount = successfulSnapshotCount;

  if (!tracker.baselineEstablished) {
    for (const task of tasks) tracker.observedTaskIds.add(task.taskId);
    tracker.baselineEstablished = true;
    return [];
  }

  const alertTaskIds: string[] = [];
  for (const task of tasks) {
    if (tracker.observedTaskIds.has(task.taskId)) continue;
    tracker.observedTaskIds.add(task.taskId);
    if (
      task.retrievalNotificationEnabled !== false &&
      isActionableRetrieval(task)
    ) {
      alertTaskIds.push(task.taskId);
    }
  }
  return alertTaskIds;
}
