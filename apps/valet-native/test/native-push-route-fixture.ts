import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { scope } from "./production-shell-test-fixture";

export const responseIntent = (
  intentId = "10000000-0000-4000-8000-000000000001",
) => ({
  intentId,
  routeIntent: "TASK_QUEUE" as const,
});

export function routeAuth(
  phase: NativeAuthSnapshot["phase"],
  authGeneration = 1,
): NativeAuthSnapshot {
  return { authGeneration, phase } as NativeAuthSnapshot;
}

export function routeSnapshot(
  options: {
    readonly count?: number;
    readonly generation?: number | null;
    readonly phase?: EmployeeOperationalSnapshot["phase"];
    readonly queueFailure?: boolean;
    readonly locationId?: string;
  } = {},
): EmployeeOperationalSnapshot {
  const phase = options.phase ?? "ready";
  const activeScope =
    phase === "ready"
      ? { ...scope, locationId: options.locationId ?? scope.locationId }
      : null;
  return {
    activeShiftCount: phase === "ambiguous-active-shifts" ? 2 : null,
    contextFailure: phase === "error" ? failure() : null,
    identityGeneration:
      options.generation === undefined ? 1 : options.generation,
    mutation: { phase: "idle" },
    phase,
    queueFailure: options.queueFailure ? failure() : null,
    queueHardStopped: phase === "access-denied",
    queueLoading: false,
    queueRefreshing: false,
    successfulQueueSnapshotCount: options.count ?? 0,
    scope: activeScope,
    taskTracking: null,
    tasks: [],
  };
}

function failure() {
  return { code: "NETWORK_ERROR", message: "Synthetic read failure" };
}

export class FakeRouteOperations {
  currentSnapshot = routeSnapshot();
  refreshCalls = 0;
  refreshQueueCalls = 0;
  onRefresh: (() => Promise<void> | void) | undefined;
  onRefreshQueue: (() => Promise<void> | void) | undefined;

  current() {
    return this.currentSnapshot;
  }

  async refresh() {
    this.refreshCalls += 1;
    await this.onRefresh?.();
  }

  async refreshQueue() {
    this.refreshQueueCalls += 1;
    await this.onRefreshQueue?.();
  }
}
