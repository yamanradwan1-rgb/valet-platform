import type { NativeCameraPermissionPort } from "../scanner/native-qr-controller";
import { requestNativeCameraPermission } from "../scanner/native-camera-permission-lifecycle";
import {
  NativePlateOcrLoop,
  type NativePlateOcrPorts,
} from "./native-plate-ocr-loop";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import { NativePlateCameraTrace } from "./native-plate-camera-trace";
import { recordPlateCameraPermission } from "./native-plate-camera-permission-trace";
import { NativePlateCameraFallback } from "./native-plate-camera-fallback";
import {
  beginCameraReady,
  finishPhysicalMetric,
} from "../diagnostics/native-physical-diagnostics";
export interface NativePlateCameraSnapshot {
  readonly generation: number;
  readonly mountId: number;
  readonly pictureSize?: string | undefined;
  readonly preferredPictureSize?: string | undefined;
  readonly fallbackPictureSize?: string | undefined;
  readonly captureFallbackUsed: boolean;
  readonly captureBusy: boolean;
  readonly noMatchSinceCapture: boolean;
  /** Requested illumination only; Expo does not report hardware activation. */
  readonly torchEnabled: boolean;
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
    mountId: 0,
    phase: "idle",
    canAskAgain: true,
    captureFallbackUsed: false,
    captureBusy: false,
    noMatchSinceCapture: false,
    torchEnabled: false,
  };
  private readonly fallback: NativePlateCameraFallback;
  private activeOperationId: number | undefined;
  private readonly listeners = new Set<() => void>();

  private readonly ocr: NativePlateOcrLoop | undefined;
  constructor(
    private readonly permissions: NativeCameraPermissionPort,
    ports?: NativePlateOcrPorts,
    readonly trace = new NativePlateCameraTrace(),
  ) {
    trace.bind(this.current);
    this.fallback = new NativePlateCameraFallback(
      this.current,
      (generation) => this.isCurrent(generation),
      (snapshot) => this.publish(snapshot),
      trace,
    );
    if (ports)
      this.ocr = new NativePlateOcrLoop(
        ports,
        (generation) =>
          this.isCurrent(generation) &&
          (this.snapshot.phase === "preview" ||
            this.fallback.awaiting(generation)),
        (generation, operationId, result) => {
          if (
            !this.isCurrent(generation) ||
            this.activeOperationId !== operationId ||
            this.snapshot.phase !== "preview"
          )
            return;
          this.activeOperationId = undefined;
          if (result.status === "NO_MATCH") {
            // Operation and owned files are finished; retain mount/ROI/Torch.
            this.publish({
              ...this.snapshot,
              captureBusy: false,
              noMatchSinceCapture: true,
            });
            return;
          }
          this.close();
          if (!this.eligible || this.snapshot.generation !== generation + 1)
            return;
          if (result.status === "MATCH")
            ports.accept(result.candidate.plateNumberRaw);
          else
            this.publish({
              ...this.snapshot,
              phase: "unavailable",
            });
        },
        trace,
      );
  }

  current = (): NativePlateCameraSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  toggleTorch(generation: number, mountId: number): void {
    this.trace.record("torch-request", { generation, mountId });
    if (
      !this.isCurrent(generation) ||
      this.snapshot.mountId !== mountId ||
      this.snapshot.phase !== "preview"
    )
      return;
    this.publish({
      ...this.snapshot,
      torchEnabled: !this.snapshot.torchEnabled,
    });
  }

  /** Called only by the employee's Capture button, never camera readiness. */
  capture(generation: number, mountId: number): boolean {
    if (
      !this.isCurrent(generation) ||
      this.snapshot.mountId !== mountId ||
      this.snapshot.phase !== "preview" ||
      this.snapshot.captureBusy ||
      !this.ocr
    )
      return false;
    const id = this.ocr.start(generation);
    if (id === undefined) return false;
    this.activeOperationId = id;
    this.publish({
      ...this.snapshot,
      captureBusy: true,
      noMatchSinceCapture: false,
    });
    return true;
  }

  async open(): Promise<void> {
    this.trace.record("open-request", { eligible: this.eligible });
    if (
      !this.eligible ||
      ["requesting", "starting", "preview"].includes(this.snapshot.phase)
    )
      return;
    const generation = this.snapshot.generation + 1;
    beginCameraReady();
    this.publish({ ...this.snapshot, generation, phase: "requesting" });
    const owner = this.trace.owner();
    try {
      this.trace.record("permission-read", owner);
      let permission = await this.permissions.get();
      recordPlateCameraPermission(this.trace, owner, permission);
      if (!this.isCurrent(generation)) return;
      if (!permission.granted && permission.canAskAgain) {
        this.trace.record("permission-request", owner);
        permission = await requestNativeCameraPermission(() =>
          this.permissions.request(),
        );
        recordPlateCameraPermission(this.trace, owner, permission);
      }
      if (!this.isCurrent(generation)) return;
      this.publish({
        ...this.snapshot,
        generation,
        phase: permission.granted ? "starting" : "denied",
        canAskAgain: permission.canAskAgain,
        pictureSize: this.snapshot.preferredPictureSize,
        mountId: this.snapshot.mountId + 1,
        captureFallbackUsed: false,
        captureBusy: false,
        noMatchSinceCapture: false,
      });
      if (!permission.granted)
        finishPhysicalMetric(
          "camera_ready_ms",
          "failure",
          "camera-unavailable",
        );
    } catch {
      this.trace.record("permission-failure", {
        ...owner,
        reason: "permission",
      });
      this.fail(generation);
    }
  }

  ready(generation: number): void {
    if (this.isCurrent(generation) && this.snapshot.phase === "starting") {
      this.publish({ ...this.snapshot, phase: "preview" });
      finishPhysicalMetric("camera_ready_ms", "success");
      if (this.fallback.awaiting(generation)) {
        this.fallback.settle(true);
        return;
      }
      logNativePlateOcr("preview-ready");
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
    this.trace.record("remount-request", {
      generation,
      reason: "preferred",
      pictureSize,
      fallbackPictureSize,
    });
    this.publish({
      ...this.snapshot,
      pictureSize,
      mountId: this.snapshot.mountId + 1,
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
    return this.fallback.wait(generation, signal);
  }

  fail(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.fallback.settle(false);
    this.activeOperationId = undefined;
    this.ocr?.cancel();
    finishPhysicalMetric("camera_ready_ms", "failure", "camera-unavailable");
    // Expo mount errors do not reliably distinguish busy/missing hardware.
    this.publish({
      ...this.snapshot,
      generation: generation + 1,
      phase: "error",
      torchEnabled: false,
      captureBusy: false,
      noMatchSinceCapture: false,
    });
  }

  geometryUnavailable(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.close();
    this.publish({ ...this.snapshot, phase: "unavailable" });
  }

  close(): void {
    this.trace.record("controller-close");
    this.fallback.settle(false);
    this.activeOperationId = undefined;
    this.ocr?.cancel();
    finishPhysicalMetric("camera_ready_ms", "failure", "cancelled");
    this.publish({
      ...this.snapshot,
      generation: this.snapshot.generation + 1,
      phase: "idle",
      torchEnabled: false,
      captureBusy: false,
      noMatchSinceCapture: false,
    });
  }

  setEligible(eligible: boolean): void {
    this.trace.record("eligibility", { eligible });
    this.eligible = eligible;
    if (!eligible) this.close();
  }

  private isCurrent(generation: number): boolean {
    return this.eligible && generation === this.snapshot.generation;
  }

  private publish(snapshot: NativePlateCameraSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    this.trace.transition(previous, snapshot);
    this.listeners.forEach((listener) => listener());
  }
}
