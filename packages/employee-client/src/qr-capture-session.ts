import { parseQrInput, type QrInput, type QrInputKind } from "./qr-input";

export type QrCapturePhase =
  | "idle"
  | "requesting"
  | "starting"
  | "scanning"
  | "accepted"
  | "denied"
  | "unavailable"
  | "error";

export interface QrCaptureSnapshot {
  readonly phase: QrCapturePhase;
  readonly generation: number;
  readonly rejection: string | null;
  readonly rejectionCount: number;
}

/** Synchronous, platform-free lifecycle fence. No persistence or business I/O. */
export class QrCaptureSession {
  #value: QrInput | null = null;
  #lastRejected: string | null = null;
  private snapshot: QrCaptureSnapshot = {
    phase: "idle",
    generation: 0,
    rejection: null,
    rejectionCount: 0,
  };

  constructor(private readonly kind: QrInputKind) {}

  current(): QrCaptureSnapshot {
    return this.snapshot;
  }
  toJSON(): QrCaptureSnapshot {
    return this.snapshot;
  }
  input(): QrInput | null {
    return this.#value;
  }

  /** Only an explicit user action may call begin (including Scan again). */
  begin(): number | null {
    if (["requesting", "starting", "scanning"].includes(this.snapshot.phase)) {
      return null;
    }
    this.close();
    this.setPhase("requesting");
    return this.snapshot.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.snapshot.generation;
  }

  permission(generation: number, granted: boolean): void {
    if (!this.isCurrent(generation) || this.snapshot.phase !== "requesting")
      return;
    if (granted) this.setPhase("starting");
    else this.fail(generation, "denied");
  }

  ready(generation: number): void {
    if (this.isCurrent(generation) && this.snapshot.phase === "starting") {
      this.setPhase("scanning");
    }
  }

  fail(generation: number, phase: "denied" | "unavailable" | "error"): void {
    if (
      !this.isCurrent(generation) ||
      !["requesting", "starting", "scanning"].includes(this.snapshot.phase)
    )
      return;
    this.close();
    this.setPhase(phase);
  }

  decode(generation: number, raw: unknown): boolean {
    if (
      !this.isCurrent(generation) ||
      !["starting", "scanning"].includes(this.snapshot.phase)
    )
      return false;
    const result = parseQrInput(raw, this.kind);
    if (!result.ok) {
      if (typeof raw === "string" && raw !== this.#lastRejected) {
        this.#lastRejected = raw;
        this.snapshot = {
          ...this.snapshot,
          rejection: result.reason,
          rejectionCount: this.snapshot.rejectionCount + 1,
        };
      }
      return false;
    }
    // Invalidate all callbacks BEFORE publishing the accepted input.
    this.close();
    this.#value = result.value;
    this.setPhase("accepted");
    return true;
  }

  close(): void {
    this.#value = null;
    this.#lastRejected = null;
    this.snapshot = {
      phase: "idle",
      generation: this.snapshot.generation + 1,
      rejection: null,
      rejectionCount: 0,
    };
  }

  private setPhase(phase: QrCapturePhase): void {
    this.snapshot = { ...this.snapshot, phase };
  }
}
