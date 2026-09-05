import type { EmployeeOperationalSnapshot } from "./employee-operational-types";

export interface EmployeeRetrievalAttentionResult {
  readonly newTaskIds: readonly string[];
  readonly scopeChanged: boolean;
}

function attentionScope(snapshot: EmployeeOperationalSnapshot): string | null {
  const scope = snapshot.scope;
  if (snapshot.identityGeneration === null || scope === null) {
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

function hasDefinitiveAttentionLoss(
  snapshot: EmployeeOperationalSnapshot,
): boolean {
  return (
    snapshot.identityGeneration === null ||
    snapshot.queueHardStopped ||
    snapshot.phase === "access-denied" ||
    snapshot.phase === "ambiguous-active-shifts" ||
    snapshot.phase === "inactive" ||
    snapshot.phase === "no-active-shift" ||
    snapshot.phase === "no-usable-location"
  );
}

export class EmployeeRetrievalAttentionTracker {
  private hasBaseline = false;
  private lastSnapshotCount = 0;
  private observed = new Set<string>();
  private scope: string | null = null;

  observe(
    snapshot: EmployeeOperationalSnapshot,
  ): EmployeeRetrievalAttentionResult {
    if (hasDefinitiveAttentionLoss(snapshot)) {
      const scopeChanged = this.scope !== null;
      this.clear();
      return { newTaskIds: [], scopeChanged };
    }
    const scope = attentionScope(snapshot);
    if (scope === null) {
      this.lastSnapshotCount = 0;
      return { newTaskIds: [], scopeChanged: false };
    }
    const scopeChanged = scope !== this.scope;
    if (scopeChanged) {
      this.scope = scope;
      this.hasBaseline = false;
      this.lastSnapshotCount = 0;
      this.observed.clear();
    }
    if (snapshot.successfulQueueSnapshotCount < this.lastSnapshotCount) {
      this.lastSnapshotCount = 0;
    }
    if (snapshot.successfulQueueSnapshotCount <= this.lastSnapshotCount) {
      return { newTaskIds: [], scopeChanged };
    }

    const baseline = !this.hasBaseline;
    this.hasBaseline = true;
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
    this.hasBaseline = false;
    this.lastSnapshotCount = 0;
    this.observed.clear();
  }
}

export class EmployeeRetrievalAttentionOwner {
  private pendingTaskIds: readonly string[] = [];
  private readonly tracker = new EmployeeRetrievalAttentionTracker();

  observe(snapshot: EmployeeOperationalSnapshot): readonly string[] {
    const result = this.tracker.observe(snapshot);
    if (result.scopeChanged) this.pendingTaskIds = [];
    if (result.newTaskIds.length > 0) {
      this.pendingTaskIds = [
        ...this.pendingTaskIds,
        ...result.newTaskIds.filter(
          (taskId) => !this.pendingTaskIds.includes(taskId),
        ),
      ];
    }
    return this.pendingTaskIds;
  }

  dismiss(taskId: string): readonly string[] {
    this.pendingTaskIds = this.pendingTaskIds.filter(
      (candidate) => candidate !== taskId,
    );
    return this.pendingTaskIds;
  }

  clear(): void {
    this.pendingTaskIds = [];
    this.tracker.clear();
  }
}
