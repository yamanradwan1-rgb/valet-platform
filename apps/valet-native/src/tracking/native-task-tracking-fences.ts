interface TrackingFence {
  readonly key: string;
  readonly snapshotCount: number;
  readonly terminal?: true;
}

/** Runtime-only admission barriers; the queue's successful snapshot count is authoritative. */
export class NativeTaskTrackingFences {
  private completion: TrackingFence | undefined;
  private network: TrackingFence | undefined;

  constructor(private readonly snapshotCount: () => number) {}

  hasPending(): boolean {
    return this.network !== undefined || this.completion !== undefined;
  }

  pauseNetwork(key: string | undefined): void {
    if (key === undefined || this.network !== undefined) return;
    this.network = { key, snapshotCount: this.snapshotCount() };
  }

  suspendCompletion(key: string | undefined): boolean {
    if (key === undefined) return false;
    this.completion = { key, snapshotCount: this.snapshotCount() };
    return true;
  }

  finishMovement(key: string | undefined): void {
    const completedKey = this.completion?.key ?? key;
    this.network = undefined;
    this.completion =
      completedKey === undefined
        ? undefined
        : {
            key: completedKey,
            snapshotCount: this.snapshotCount(),
            terminal: true,
          };
  }

  release(
    kind: "network" | "completion",
    candidateKey: string | undefined,
  ): boolean {
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
    this.network = undefined;
    this.completion = undefined;
  }
}
