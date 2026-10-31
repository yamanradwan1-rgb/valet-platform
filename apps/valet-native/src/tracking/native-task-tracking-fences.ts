interface TrackingFence {
  readonly key: string;
  readonly snapshotCount: number;
  readonly terminal?: true;
}

type MovementType = "PARKING" | "RETRIEVAL";

/** Runtime-only admission barriers; the queue's successful snapshot count is authoritative. */
export class NativeTaskTrackingFences {
  private readonly completed = new Set<string>();
  private readonly completionOrigins = new Map<MovementType, string>();
  private completion: TrackingFence | undefined;
  private network: TrackingFence | undefined;

  constructor(private readonly snapshotCount: () => number) {}

  hasPending(): boolean {
    return this.network !== undefined || this.completion !== undefined;
  }

  isCompleted(key: string | undefined): boolean {
    return key !== undefined && this.completed.has(key);
  }

  pauseNetwork(key: string | undefined): void {
    if (key === undefined || this.network !== undefined) return;
    this.network = { key, snapshotCount: this.snapshotCount() };
  }

  suspendCompletion(key: string | undefined, type: MovementType): boolean {
    if (key === undefined) return false;
    this.completionOrigins.set(type, key);
    this.completion = { key, snapshotCount: this.snapshotCount() };
    return true;
  }

  finishMovement(
    type: MovementType,
    currentKey: string | undefined,
  ): string | undefined {
    const completedKey = this.completionOrigins.get(type);
    if (completedKey === undefined) return undefined;
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
    this.network = undefined;
    this.completion = undefined;
  }
}
