import type { NativeCameraPermissionPort } from "../scanner/native-qr-controller";
import { requestNativeCameraPermission } from "../scanner/native-camera-permission-lifecycle";
import {
  NativePlateOcrLoop,
  type NativePlateOcrPorts,
} from "./native-plate-ocr-loop";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import {
  beginCameraReady,
  finishPhysicalMetric,
} from "../diagnostics/native-physical-diagnostics";

export interface NativePlateCameraSnapshot {
  readonly generation: number;
  readonly pictureSize?: string | undefined;
  readonly preferredPictureSize?: string | undefined;
  readonly fallbackPictureSize?: string | undefined;
  readonly captureFallbackUsed: boolean;
  readonly phase:
    | "idle"
    | "requesting"
    | "starting"
    | "preview"
    | "denied"
    | "error"
    | "no-match"
    | "unavailable";
  readonly canAskAgain: boolean;
}

/** Camera ownership plus generation-fenced assistive acquisition only. */
export class NativePlateCameraController {
  private eligible = false;
  private snapshot: NativePlateCameraSnapshot = {
    generation: 0,
    phase: "idle",
    canAskAgain: true,
    captureFallbackUsed: false,
  };
  private fallbackReady:
    | {
        readonly generation: number;
        readonly signal: AbortSignal;
        readonly resolve: (ready: boolean) => void;
        readonly aborted: () => void;
      }
    | undefined;
  private readonly listeners = new Set<() => void>();

  private readonly ocr: NativePlateOcrLoop | undefined;
  constructor(
    private readonly permissions: NativeCameraPermissionPort,
    ports?: NativePlateOcrPorts,
  ) {
    if (ports)
      this.ocr = new NativePlateOcrLoop(
        ports,
        (generation) =>
          this.isCurrent(generation) && this.snapshot.phase === "preview",
        (generation, result) => {
          if (!this.isCurrent(generation)) return;
          this.close();
          if (!this.eligible || this.snapshot.generation !== generation + 1)
            return;
          if (result.status === "MATCH")
            ports.accept(result.candidate.plateNumberRaw);
          else
            this.publish({
              ...this.snapshot,
              phase: result.status === "NO_MATCH" ? "no-match" : "unavailable",
            });
        },
      );
  }

  current = (): NativePlateCameraSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async open(): Promise<void> {
    if (
      !this.eligible ||
      ["requesting", "starting", "preview"].includes(this.snapshot.phase)
    )
      return;
    const generation = this.snapshot.generation + 1;
    beginCameraReady();
    this.publish({ ...this.snapshot, generation, phase: "requesting" });
    try {
      let permission = await this.permissions.get();
      if (!this.isCurrent(generation)) return;
      if (!permission.granted && permission.canAskAgain)
        permission = await requestNativeCameraPermission(() =>
          this.permissions.request(),
        );
      if (!this.isCurrent(generation)) return;
      this.publish({
        ...this.snapshot,
        generation,
        phase: permission.granted ? "starting" : "denied",
        canAskAgain: permission.canAskAgain,
        pictureSize: this.snapshot.preferredPictureSize,
        captureFallbackUsed: false,
      });
      if (!permission.granted)
        finishPhysicalMetric(
          "camera_ready_ms",
          "failure",
          "camera-unavailable",
        );
    } catch {
      this.fail(generation);
    }
  }

  ready(generation: number): void {
    if (this.isCurrent(generation) && this.snapshot.phase === "starting") {
      this.publish({ ...this.snapshot, phase: "preview" });
      finishPhysicalMetric("camera_ready_ms", "success");
      if (this.fallbackReady?.generation === generation) {
        this.resolveFallback(true);
        return;
      }
      logNativePlateOcr("preview-ready");
      if (this.ocr?.start(generation)) logNativePlateOcr("loop-start");
    }
  }

  configurePictureSizes(
    generation: number,
    pictureSize: string,
    fallbackPictureSize?: string,
  ): boolean {
    if (
      !this.isCurrent(generation) ||
      this.snapshot.phase !== "starting" ||
      this.snapshot.pictureSize === pictureSize
    )
      return false;
    this.publish({
      ...this.snapshot,
      pictureSize,
      preferredPictureSize: pictureSize,
      fallbackPictureSize,
      captureFallbackUsed: false,
    });
    return true;
  }

  waitForCaptureFallback(
    generation: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    const fallback = this.snapshot.fallbackPictureSize;
    if (
      signal.aborted ||
      !fallback ||
      !this.isCurrent(generation) ||
      this.snapshot.phase !== "preview" ||
      this.snapshot.captureFallbackUsed ||
      this.fallbackReady
    )
      return Promise.resolve(false);
    logNativePlateOcr("camera-capture-fallback");
    logNativePlateOcr("picture-size-selected", { value: fallback });
    logNativePlateOcr("picture-size-remount");
    return new Promise((resolve) => {
      const aborted = () => this.resolveFallback(false);
      this.fallbackReady = { generation, signal, resolve, aborted };
      signal.addEventListener("abort", aborted, { once: true });
      this.publish({
        ...this.snapshot,
        pictureSize: fallback,
        captureFallbackUsed: true,
        phase: "starting",
      });
    });
  }

  fail(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.resolveFallback(false);
    this.ocr?.cancel();
    finishPhysicalMetric("camera_ready_ms", "failure", "camera-unavailable");
    // Expo mount errors do not reliably distinguish busy/missing hardware.
    this.publish({
      ...this.snapshot,
      generation: generation + 1,
      phase: "error",
    });
  }

  close(): void {
    this.resolveFallback(false);
    this.ocr?.cancel();
    finishPhysicalMetric("camera_ready_ms", "failure", "cancelled");
    this.publish({
      ...this.snapshot,
      generation: this.snapshot.generation + 1,
      phase: "idle",
    });
  }

  setEligible(eligible: boolean): void {
    this.eligible = eligible;
    if (!eligible) this.close();
  }

  private isCurrent(generation: number): boolean {
    return this.eligible && generation === this.snapshot.generation;
  }

  private resolveFallback(ready: boolean): void {
    const fallback = this.fallbackReady;
    if (!fallback) return;
    this.fallbackReady = undefined;
    fallback.signal.removeEventListener("abort", fallback.aborted);
    fallback.resolve(ready);
  }

  private publish(snapshot: NativePlateCameraSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
