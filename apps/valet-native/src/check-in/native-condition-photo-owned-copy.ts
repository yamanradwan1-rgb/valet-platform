import type { Directory, File } from "expo-file-system";
import { observePhotoStage, observePhotoStageAsync,
  type NativePhotoStageObserver } from "./native-photo-stage";

/** Single native-copy boundary with cancellation and session-retirement fences. */
export class NativeConditionPhotoOwnedCopy {
  private epoch = 0;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly retired = new Set<string>();

  generation(): number { return this.epoch; }

  retireScope(): void { this.epoch += 1; }

  hasPending(): boolean { return this.inFlight.size > 0; }

  /** Never sweep a destination while the native coroutine still writes it. */
  canPurge(): boolean {
    this.retireScope();
    return !this.hasPending();
  }

  /** Deletion must wait for a native copy that may still be writing this file. */
  async settleBeforeDiscard(handle: string): Promise<void> {
    const copy = this.inFlight.get(handle);
    if (!copy) return;
    this.retired.add(handle);
    try { await copy; } catch { /* native rejection belongs to capture */ }
  }

  async copyAndVerify(
    handle: string, source: File, owned: File, folder: Directory,
    generation: number, observer?: NativePhotoStageObserver,
  ): Promise<void> {
    if (generation !== this.epoch) throw new Error("CONDITION_PHOTO_CAPTURE_RETIRED");
    const copy = observePhotoStageAsync(observer, "owned-copy", async () => {
      folder.create({ idempotent: true, intermediates: true });
      await source.copy(owned);
    });
    this.inFlight.set(handle, copy);
    try {
      await copy;
      if (generation !== this.epoch || this.retired.has(handle))
        throw new Error("CONDITION_PHOTO_CAPTURE_RETIRED");
      observePhotoStage(observer, "copy-verify", () => {
        if (!source.exists || source.size <= 0 || !owned.exists ||
            owned.size !== source.size)
          throw new Error("CONDITION_PHOTO_FILE_INVALID");
      });
    } finally {
      this.inFlight.delete(handle);
      this.retired.delete(handle);
    }
  }
}
