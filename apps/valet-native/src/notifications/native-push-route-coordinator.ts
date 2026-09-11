import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import type { IntentReceipt } from "../shell/production-shell-controller";
import type { NativePushRouteIntent } from "./native-push-response-types";

type ReadOperations = Pick<
  EmployeeOperationalSession,
  "current" | "refresh" | "refreshQueue"
>;

export type NativePushRouteObservation =
  | { readonly kind: "route-dropped" | "route-held" | "route-resolved" }
  | {
      readonly durationMs: number;
      readonly kind: "canonical-refresh-failed" | "canonical-refresh-succeeded";
    };

interface PendingAttention {
  binding: number | null;
  readonly key: string;
}

export interface NativePushRouteCoordinatorOptions {
  readonly auth: NativeAuthSnapshot;
  readonly now?: (() => number) | undefined;
  readonly observe?:
    ((observation: NativePushRouteObservation) => void) | undefined;
  readonly operations: ReadOperations;
  readonly routeTasks: () => IntentReceipt;
}

const pendingLimit = 16;

export class NativePushRouteCoordinator {
  private active: Promise<void> | undefined;
  private auth: NativeAuthSnapshot;
  private disposed = false;
  private epoch = 0;
  private foreground = false;
  private openSequence = 0;
  private pending: PendingAttention[] = [];
  private wakeAfterActive = false;

  constructor(private readonly options: NativePushRouteCoordinatorOptions) {
    this.auth = options.auth;
  }

  receive(intent: NativePushRouteIntent): void {
    this.enqueue({
      binding:
        this.auth.phase === "authenticated" ? this.auth.authGeneration : null,
      key: `response:${intent.intentId}`,
    });
  }

  requestForegroundOpen(): void {
    this.openSequence += 1;
    this.enqueue({
      binding:
        this.auth.phase === "authenticated" ? this.auth.authGeneration : null,
      key: `foreground:${this.openSequence}`,
    });
  }

  setAuth(auth: NativeAuthSnapshot): void {
    const previousGeneration = this.auth.authGeneration;
    this.auth = auth;
    if (auth.authGeneration !== previousGeneration) {
      this.epoch += 1;
      this.pending = this.pending.filter(
        (attention) =>
          attention.binding === null ||
          attention.binding === auth.authGeneration,
      );
    }
    this.schedule(true);
  }

  setForeground(foreground: boolean): void {
    this.foreground = foreground;
    if (foreground) this.schedule(true);
  }

  retry(): void {
    this.schedule(true);
  }

  whenIdle(): Promise<void> {
    return this.active ?? Promise.resolve();
  }

  purgeIdentityScoped(): void {
    this.epoch += 1;
    this.pending = this.pending.filter(
      (attention) => attention.binding === null,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    this.pending = [];
  }

  private enqueue(attention: PendingAttention): void {
    if (
      this.disposed ||
      this.pending.some((item) => item.key === attention.key)
    )
      return;
    this.pending.push(attention);
    if (this.pending.length > pendingLimit) this.pending.shift();
    this.observe({ kind: "route-held" });
    this.schedule(true);
  }

  private schedule(wakeIfActive = false): void {
    if (this.active !== undefined) {
      if (wakeIfActive) this.wakeAfterActive = true;
      return;
    }
    if (
      this.disposed ||
      !this.foreground ||
      this.auth.phase !== "authenticated" ||
      this.pending.length === 0
    ) {
      return;
    }
    const operation = this.drain().finally(() => {
      if (this.active === operation) this.active = undefined;
      if (this.wakeAfterActive) {
        this.wakeAfterActive = false;
        this.schedule();
      }
    });
    this.active = operation;
  }

  private async drain(): Promise<void> {
    while (
      !this.disposed &&
      this.foreground &&
      this.auth.phase === "authenticated" &&
      this.pending.length > 0
    ) {
      const attention = this.pending[0]!;
      const generation = this.auth.authGeneration;
      if (attention.binding !== null && attention.binding !== generation) {
        this.pending.shift();
        this.observe({ kind: "route-dropped" });
        continue;
      }
      attention.binding = generation;
      const attemptEpoch = this.epoch;
      const startedAt = this.now();
      const baseline = this.options.operations.current();
      await this.options.operations.refresh();
      if (!this.isCurrent(generation, attemptEpoch)) return;
      let snapshot = this.options.operations.current();
      if (
        snapshot.phase === "ready" &&
        snapshot.scope !== null &&
        snapshot.queueFailure === null &&
        !queueAdvanced(snapshot, baseline)
      ) {
        await this.options.operations.refreshQueue();
        if (!this.isCurrent(generation, attemptEpoch)) return;
        snapshot = this.options.operations.current();
      }
      if (canonicalRefreshSucceeded(snapshot, baseline, generation)) {
        this.observe({
          durationMs: Math.max(0, this.now() - startedAt),
          kind: "canonical-refresh-succeeded",
        });
        this.pending.shift();
        const receipt = this.options.routeTasks();
        this.observe({ kind: routeObservationKind(receipt) });
        continue;
      }
      this.observe({
        durationMs: Math.max(0, this.now() - startedAt),
        kind: "canonical-refresh-failed",
      });
      if (isAuthoritativeGate(snapshot, generation)) {
        this.pending.shift();
        this.observe({ kind: "route-dropped" });
        continue;
      }
      return;
    }
  }

  private isCurrent(generation: number, epoch: number): boolean {
    return (
      !this.disposed &&
      this.epoch === epoch &&
      this.auth.phase === "authenticated" &&
      this.auth.authGeneration === generation
    );
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private observe(observation: NativePushRouteObservation): void {
    try {
      this.options.observe?.(observation);
    } catch {
      // Optional observations cannot affect auth, refresh, or routing.
    }
  }
}

function canonicalRefreshSucceeded(
  snapshot: EmployeeOperationalSnapshot,
  baseline: EmployeeOperationalSnapshot,
  generation: number,
): boolean {
  return (
    snapshot.identityGeneration === generation &&
    snapshot.phase === "ready" &&
    snapshot.scope !== null &&
    snapshot.contextFailure === null &&
    snapshot.queueFailure === null &&
    !snapshot.queueHardStopped &&
    queueAdvanced(snapshot, baseline)
  );
}

function queueAdvanced(
  snapshot: EmployeeOperationalSnapshot,
  baseline: EmployeeOperationalSnapshot,
): boolean {
  return (
    snapshot.successfulQueueSnapshotCount >
      baseline.successfulQueueSnapshotCount ||
    (snapshot.successfulQueueSnapshotCount > 0 &&
      operationalScopeKey(snapshot) !== operationalScopeKey(baseline))
  );
}

function operationalScopeKey(snapshot: EmployeeOperationalSnapshot): string {
  const scope = snapshot.scope;
  return scope === null
    ? ""
    : [
        snapshot.identityGeneration,
        scope.organizationId,
        scope.membershipId,
        scope.locationId,
        scope.shiftId,
      ].join(":");
}

function isAuthoritativeGate(
  snapshot: EmployeeOperationalSnapshot,
  generation: number,
): boolean {
  return (
    snapshot.identityGeneration === generation &&
    (snapshot.phase === "access-denied" ||
      (snapshot.phase === "error" &&
        snapshot.contextFailure?.code === "AUTHORIZATION_DENIED") ||
      snapshot.phase === "ambiguous-active-shifts" ||
      snapshot.phase === "no-active-shift" ||
      snapshot.phase === "no-usable-location" ||
      snapshot.queueHardStopped)
  );
}

function routeObservationKind(
  receipt: IntentReceipt,
): "route-dropped" | "route-held" | "route-resolved" {
  if (receipt === "held") return "route-held";
  if (receipt === "rejected") return "route-dropped";
  return "route-resolved";
}
