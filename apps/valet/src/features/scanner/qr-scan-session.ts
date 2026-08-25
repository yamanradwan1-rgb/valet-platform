/**
 * Framework-free QR scan session controller (DEC-067).
 *
 * Owns the mandatory lifecycle obligations: all camera resources are released
 * on close, on an accepted decode, and before any failure is reported;
 * duplicate decodes stay suppressed until the consumer deliberately re-arms.
 * A monotonic start-generation token guarantees an asynchronous openCamera()
 * resolution can never reactivate or retain resources after close(), unmount,
 * an identity change, an accepted decode during startup, or a newer lifecycle
 * invalidating the original begin(). React integration lives in
 * use-qr-scanner-capture.ts.
 */

import {
  classifyCameraStartError,
  evaluateCameraAvailability,
  type CameraEnvironmentProbe,
  type CameraStartFailure,
} from "./camera-environment";
import { stopAllStreamTracks } from "./camera-stream-tracks";

export type QrScanPhase = "idle" | "starting" | "scanning";

export type QrScanFailureState = CameraStartFailure | "unsupported";

export interface QrDecoderHandle {
  stop(): void;
}

export type QrInterpretResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

export interface QrScanSessionOptions<TValue> {
  /** Maps one decoded frame's text onto a typed value or rejects it. */
  interpret(text: string): QrInterpretResult<TValue>;
  /** Environment probe (injectable for boundary tests). */
  probeEnvironment(): CameraEnvironmentProbe;
  /** Opens the camera + continuous decoder; resolves when scanning is live. */
  openCamera(onText: (text: string) => void): Promise<QrDecoderHandle>;
  /** Current preview MediaStream, for defensive track cleanup. */
  previewStream(): unknown;
  onPhase(phase: QrScanPhase): void;
  onFailure(state: QrScanFailureState): void;
  onRejected(reason: string): void;
  onAccepted(value: TValue): void;
}

export class QrScanSession<TValue> {
  private phase: QrScanPhase = "idle";
  private suppressed = false;
  private decoderHandle: QrDecoderHandle | null = null;
  private lastRejectedText: string | null = null;
  /**
   * Monotonic attempt token. Every invalidating event (close, accepted decode,
   * a newer lifecycle) bumps it so an in-flight openCamera() resolution is
   * recognized as stale BEFORE its handle can be adopted.
   */
  private startGeneration = 0;

  private readonly options: QrScanSessionOptions<TValue>;

  constructor(options: QrScanSessionOptions<TValue>) {
    this.options = options;
  }

  getPhase(): QrScanPhase {
    return this.phase;
  }

  isSuppressed(): boolean {
    return this.suppressed;
  }

  /**
   * Starts the camera and continuous decoding. A failed start releases every
   * resource BEFORE the failure state is reported — never a half-open camera.
   * If the attempt is invalidated while openCamera() is pending (close,
   * accepted decode, newer lifecycle), the eventually-returned decoder handle
   * is stopped immediately and no scanning phase or extra result is produced.
   */
  async begin(): Promise<void> {
    if (this.phase !== "idle") return;
    this.setPhase("starting");
    const generation = ++this.startGeneration;
    const availability = evaluateCameraAvailability(
      this.options.probeEnvironment(),
    );
    if (availability !== "supported") {
      this.releaseResources();
      this.options.onFailure("unsupported");
      return;
    }
    try {
      const handle = await this.options.openCamera((text) => {
        this.handleDecodedText(text);
      });
      const attemptIsCurrent =
        generation === this.startGeneration &&
        this.getPhase() === "starting" &&
        !this.suppressed;
      if (!attemptIsCurrent) {
        handle.stop();
        stopAllStreamTracks(this.options.previewStream());
        return;
      }
      this.lastRejectedText = null;
      this.decoderHandle = handle;
      this.setPhase("scanning");
    } catch (error) {
      if (
        generation !== this.startGeneration ||
        this.getPhase() !== "starting"
      ) {
        stopAllStreamTracks(this.options.previewStream());
        return;
      }
      this.releaseResources();
      this.options.onFailure(classifyCameraStartError(error));
    }
  }

  /**
   * Full consumer-initiated close: invalidates any in-flight start attempt
   * BEFORE/while releasing resources, and clears suppression so a later
   * explicit start scans fresh.
   */
  close(): void {
    this.startGeneration += 1;
    this.releaseResources();
    this.suppressed = false;
    this.lastRejectedText = null;
  }

  /** Consumer reset allowing the next accepted decode after re-start. */
  armNextScan(): void {
    this.suppressed = false;
    this.lastRejectedText = null;
  }

  /**
   * One decoded frame. Accepted frames stop the camera FIRST and are then
   * delivered exactly once; further frames stay suppressed until re-arm.
   * An acceptance also invalidates any in-flight start attempt so its future
   * returned handle cannot reactivate the camera or revert to scanning.
   * Rejected frames never touch inputs and are deduplicated consecutively so
   * a stationary wrong label cannot spam the UI.
   */
  handleDecodedText(text: unknown): void {
    if (this.suppressed) return;
    if (this.phase !== "scanning" && this.phase !== "starting") return;
    if (typeof text !== "string") return;

    const result = this.options.interpret(text);
    if (!result.ok) {
      if (this.lastRejectedText !== text) {
        this.lastRejectedText = text;
        this.options.onRejected(result.reason);
      }
      return;
    }

    this.suppressed = true;
    this.startGeneration += 1;
    this.releaseResources();
    this.options.onAccepted(result.value);
  }

  private setPhase(phase: QrScanPhase): void {
    this.phase = phase;
    this.options.onPhase(phase);
  }

  /** Idempotent resource release: decoder loop + every preview track. */
  private releaseResources(): void {
    if (this.decoderHandle !== null) {
      const handle = this.decoderHandle;
      this.decoderHandle = null;
      handle.stop();
    }
    stopAllStreamTracks(this.options.previewStream());
    this.phase = "idle";
    this.options.onPhase("idle");
  }
}
