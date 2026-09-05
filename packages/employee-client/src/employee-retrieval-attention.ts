import type { EmployeeOperationalSnapshot } from "./employee-operational-types";

export interface EmployeeRetrievalAttentionResult {
  readonly newTaskIds: readonly string[];
  readonly scopeChanged: boolean;
}

function attentionScope(snapshot: EmployeeOperationalSnapshot): string | null {
  const scope = snapshot.scope;
  if (
    snapshot.identityGeneration === null ||
    scope === null ||
    snapshot.queueHardStopped
  ) {
    return null;
  }
  return [
    snapshot.identityGeneration,
    scope.organizationId,
    scope.membershipId,
    scope.locationId,
    scope.shiftId,
  ].join(":");
}

export class EmployeeRetrievalAttentionTracker {
  private lastSnapshotCount = 0;
  private observed = new Set<string>();
  private scope: string | null = null;

  observe(
    snapshot: EmployeeOperationalSnapshot,
  ): EmployeeRetrievalAttentionResult {
    const scope = attentionScope(snapshot);
    const scopeChanged = scope !== this.scope;
    if (scopeChanged) {
      this.scope = scope;
      this.lastSnapshotCount = 0;
      this.observed.clear();
    }
    if (
      scope === null ||
      snapshot.successfulQueueSnapshotCount <= this.lastSnapshotCount
    ) {
      return { newTaskIds: [], scopeChanged };
    }

    const baseline = this.lastSnapshotCount === 0;
    this.lastSnapshotCount = snapshot.successfulQueueSnapshotCount;
    const newTaskIds: string[] = [];
    for (const task of snapshot.tasks) {
      if (this.observed.has(task.taskId)) continue;
      this.observed.add(task.taskId);
      if (
        !baseline &&
        task.taskType === "RETRIEVAL" &&
        task.status === "QUEUED" &&
        task.currentAssigneeMembershipId === null
      ) {
        newTaskIds.push(task.taskId);
      }
    }
    return { newTaskIds, scopeChanged };
  }

  clear(): void {
    this.scope = null;
    this.lastSnapshotCount = 0;
    this.observed.clear();
  }
}
