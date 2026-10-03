import type { NativeCameraPermissionPort } from "../scanner/native-qr-controller";
import { requestNativeCameraPermission } from "../scanner/native-camera-permission-lifecycle";
import {
  NativePlateOcrLoop,
  type NativePlateOcrPorts,
} from "./native-plate-ocr-loop";
import { logNativePlateOcr } from "./native-plate-ocr-diagnostics";
import { NativePlateCameraTrace } from "./native-plate-camera-trace";
import { recordPlateCameraPermission } from "./native-plate-camera-permission-trace";
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
    torchEnabled: false,
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
    readonly trace = new NativePlateCameraTrace(),
  ) {
    trace.bind(this.current);
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
    this.trace.record("fallback-request", {
      generation,
      aborted: signal.aborted,
    });
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
      this.trace.record("fallback-wait", {
        generation,
        mountId: this.snapshot.mountId + 1,
      });
      this.publish({
        ...this.snapshot,
        pictureSize: fallback,
        mountId: this.snapshot.mountId + 1,
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
      torchEnabled: false,
    });
  }

  geometryUnavailable(generation: number): void {
    if (!this.isCurrent(generation)) return;
    this.close();
    this.publish({ ...this.snapshot, phase: "unavailable" });
  }

  close(): void {
    this.trace.record("controller-close");
    this.resolveFallback(false);
    this.ocr?.cancel();
    finishPhysicalMetric("camera_ready_ms", "failure", "cancelled");
    this.publish({
      ...this.snapshot,
      generation: this.snapshot.generation + 1,
      phase: "idle",
      torchEnabled: false,
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

  private resolveFallback(ready: boolean): void {
    const fallback = this.fallbackReady;
    if (!fallback) return;
    this.trace.record(ready ? "fallback-ready" : "fallback-aborted", {
      generation: fallback.generation,
    });
    this.fallbackReady = undefined;
    fallback.signal.removeEventListener("abort", fallback.aborted);
    fallback.resolve(ready);
  }

  private publish(snapshot: NativePlateCameraSnapshot): void {
    const previous = this.snapshot;
    this.snapshot = snapshot;
    this.trace.transition(previous, snapshot);
    this.listeners.forEach((listener) => listener());
  }
}
