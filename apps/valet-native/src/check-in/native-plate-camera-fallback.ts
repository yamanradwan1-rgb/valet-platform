import type { NativePlateCameraSnapshot } from "./native-plate-camera-controller";
import type { NativePlateCameraTrace } from "./native-plate-camera-trace";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";

/** One hardware picture-size fallback per camera generation. */
export class NativePlateCameraFallback {
  private pending:
    | {
        generation: number;
        signal: AbortSignal;
        resolve: (ready: boolean) => void;
        aborted: () => void;
      }
    | undefined;

  constructor(
    private readonly current: () => NativePlateCameraSnapshot,
    private readonly isCurrent: (generation: number) => boolean,
    private readonly publish: (snapshot: NativePlateCameraSnapshot) => void,
    private readonly trace: NativePlateCameraTrace,
  ) {}

  awaiting(generation: number): boolean {
    return this.pending?.generation === generation;
  }

  wait(generation: number, signal: AbortSignal): Promise<boolean> {
    this.trace.record("fallback-request", {
      generation,
      aborted: signal.aborted,
    });
    const snapshot = this.current();
    const fallback = snapshot.fallbackPictureSize;
    if (
      signal.aborted ||
      !fallback ||
      !this.isCurrent(generation) ||
      snapshot.phase !== "preview" ||
      snapshot.captureFallbackUsed ||
      this.pending
    )
      return Promise.resolve(false);
    logNativePlateOcr("camera-capture-fallback");
    logNativePlateOcr("picture-size-selected", { value: fallback });
    logNativePlateOcr("picture-size-remount");
    return new Promise((resolve) => {
      const aborted = () => this.settle(false);
      this.pending = { generation, signal, resolve, aborted };
      signal.addEventListener("abort", aborted, { once: true });
      this.trace.record("fallback-wait", {
        generation,
        mountId: snapshot.mountId + 1,
      });
      this.publish({
        ...snapshot,
        pictureSize: fallback,
        mountId: snapshot.mountId + 1,
        captureFallbackUsed: true,
        phase: "starting",
      });
    });
  }

  settle(ready: boolean): void {
    const pending = this.pending;
    if (!pending) return;
    this.trace.record(ready ? "fallback-ready" : "fallback-aborted", {
      generation: pending.generation,
    });
    this.pending = undefined;
    pending.signal.removeEventListener("abort", pending.aborted);
    pending.resolve(ready);
  }
}
