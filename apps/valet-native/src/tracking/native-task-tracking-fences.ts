import type { EmployeeOperationalScope } from "@valet/employee-client";

import type { NativeTaskTrackingBinding } from "./native-task-tracking-types";

interface TrackingFence {
  readonly key: string;
  readonly snapshotCount: number;
  readonly terminal?: true;
}

type MovementType = "PARKING" | "RETRIEVAL";

export interface MovementSubject {
  readonly identityGeneration?: number | null;
  readonly scope?: EmployeeOperationalScope | null;
  readonly session?: { readonly sessionId: string } | null;
  readonly task?: { readonly taskId: string } | null;
}

function matches(
  type: MovementType,
  subject: MovementSubject,
  binding: NativeTaskTrackingBinding | null | undefined,
): binding is NativeTaskTrackingBinding {
  const scope = subject.scope;
  return (
    binding !== null &&
    binding !== undefined &&
    binding.taskType === type &&
    subject.identityGeneration === binding.identityGeneration &&
    scope !== null &&
    scope !== undefined &&
    scope.organizationId === binding.organizationId &&
    scope.membershipId === binding.membershipId &&
    scope.locationId === binding.locationId &&
    scope.shiftId === binding.shiftId &&
    subject.session?.sessionId === binding.sessionId &&
    (subject.task === null || subject.task?.taskId === binding.taskId)
  );
}

/** Runtime-only admission barriers; the queue's successful snapshot count is authoritative. */
export class NativeTaskTrackingFences {
  private readonly completed = new Set<string>();
  private readonly completionOrigins = new Map<
    MovementType,
    NativeTaskTrackingBinding
  >();
  private completion: TrackingFence | undefined;
  private lastScopeKey: string | undefined;
  private network: TrackingFence | undefined;

  constructor(private readonly snapshotCount: () => number) {}

  hasPending(): boolean {
    return this.network !== undefined || this.completion !== undefined;
  }

  isCompleted(key: string | undefined): boolean {
    return key !== undefined && this.completed.has(key);
  }

  observeScope(generation: number, scope: EmployeeOperationalScope): void {
    const key = [
      generation,
      scope.organizationId,
      scope.membershipId,
      scope.locationId,
      scope.shiftId,
    ].join(":");
    if (this.lastScopeKey !== undefined && this.lastScopeKey !== key)
      this.clear();
    this.lastScopeKey = key;
  }

  pauseNetwork(key: string | undefined): void {
    if (key === undefined || this.network !== undefined) return;
    this.network = { key, snapshotCount: this.snapshotCount() };
  }

  suspendCompletion(
    binding: NativeTaskTrackingBinding | null,
    type: MovementType,
    subject: MovementSubject,
    currentKey: string | undefined,
  ): boolean {
    if (
      binding === null ||
      (subject.session !== undefined && subject.session !== null
        ? !matches(type, subject, binding)
        : currentKey !== binding.key)
    )
      return false;
    this.completionOrigins.set(type, binding);
    this.completion = {
      key: binding.key,
      snapshotCount: this.snapshotCount(),
    };
    return true;
  }

  finishMovement(
    type: MovementType,
    currentKey: string | undefined,
    candidate: NativeTaskTrackingBinding | null,
    subject: MovementSubject,
  ): string | undefined {
    const origin = this.completionOrigins.get(type);
    const completed =
      subject.session === undefined || subject.session === null
        ? origin
        : matches(type, subject, origin)
          ? origin
          : matches(type, subject, candidate)
            ? candidate
            : undefined;
    if (completed === undefined) return undefined;
    const completedKey = completed.key;
    this.completed.add(completedKey);
    if (this.network?.key === completedKey) this.network = undefined;
    // A later terminal event must never impose a new fence on an active B.
    if (currentKey !== undefined && currentKey !== completedKey)
      return completedKey;
    this.completion = {
      key: completedKey,
      snapshotCount: this.snapshotCount(),
      terminal: true,
    };
    return completedKey;
  }

  release(
    kind: "network" | "completion",
    candidateKey: string | undefined,
  ): boolean {
    if (candidateKey !== undefined && this.completed.has(candidateKey))
      return false;
    const fence = kind === "network" ? this.network : this.completion;
    if (fence === undefined) return true;
    if (this.snapshotCount() <= fence.snapshotCount) return false;
    // A locally completed movement cannot resume from a stale pre-terminal GET.
    if (fence.terminal && candidateKey === fence.key) return false;
    if (kind === "network") this.network = undefined;
    else this.completion = undefined;
    return true;
  }

  clear(preserveForBackground = false): void {
    if (preserveForBackground) return;
    this.completed.clear();
    this.completionOrigins.clear();
    this.lastScopeKey = undefined;
    this.network = undefined;
    this.completion = undefined;
  }
}
