import {
  QrCaptureSession,
  type QrCaptureSnapshot,
  type QrInput,
  type QrInputKind,
} from "@valet/employee-client";
import { requestNativeCameraPermission } from "./native-camera-permission-lifecycle";

export interface CameraPermission {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}
export interface NativeQrSnapshot extends QrCaptureSnapshot {
  readonly resourceCode: string;
  readonly permission: "not-requested" | "granted" | "denied";
  readonly canAskAgain: boolean;
}
export interface NativeCameraPermissionPort {
  get(): Promise<CameraPermission>;
  request(): Promise<CameraPermission>;
}

/** Expo owns capture; this adapter owns permission and safe presentation only. */
export class NativeQrController {
  #session: QrCaptureSession;
  private listeners = new Set<() => void>();
  private eligible = true;
  private snapshot: NativeQrSnapshot;

  constructor(
    kind: QrInputKind,
    private readonly permissions: NativeCameraPermissionPort,
  ) {
    this.#session = new QrCaptureSession(kind);
    this.snapshot = {
      ...this.#session.current(),
      resourceCode: "",
      permission: "not-requested",
      canAskAgain: true,
    };
  }

  current = (): NativeQrSnapshot => this.snapshot;
  toJSON(): NativeQrSnapshot {
    return this.snapshot;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async open(): Promise<void> {
    if (!this.eligible) return;
    const generation = this.#session.begin();
    if (generation === null) return;
    this.publish();
    try {
      let permission = await this.permissions.get();
      if (!this.#session.isCurrent(generation)) return;
      if (!permission.granted && permission.canAskAgain) {
        permission = await requestNativeCameraPermission(() =>
          this.permissions.request(),
        );
      }
      if (!this.#session.isCurrent(generation)) return;
      this.snapshot = {
        ...this.snapshot,
        permission: permission.granted ? "granted" : "denied",
        canAskAgain: permission.canAskAgain,
      };
      this.#session.permission(generation, permission.granted);
      this.publish();
    } catch {
      this.fail(generation);
    }
  }

  ready(generation: number): void {
    this.#session.ready(generation);
    this.publish();
  }

  fail(generation: number): void {
    // Expo does not reliably distinguish busy/no-device: do not invent causes.
    this.#session.fail(generation, "error");
    this.publish();
  }

  barcode(
    generation: number,
    event: { type: string; data: string },
  ): QrInput | null {
    if (event.type !== "qr") return null;
    if (this.#session.decode(generation, event.data)) {
      const input = this.#session.input();
      if (input?.kind === "dynamic-handoff") {
        // Return the opaque candidate directly to the ephemeral input owner.
        // It must never enter a serializable controller snapshot.
        this.#session.close();
        this.publish();
        return input;
      }
      if (input) {
        this.snapshot = { ...this.snapshot, resourceCode: input.resourceCode };
      }
    }
    this.publish();
    return this.#session.input();
  }

  manual(resourceCode: string): void {
    if (!this.eligible) return;
    // Editing is explicit ownership of input; pending frames cannot overwrite it.
    this.#session.close();
    this.snapshot = { ...this.snapshot, resourceCode };
    this.publish();
  }

  close(): void {
    this.#session.close();
    this.publish();
  }

  clear(): void {
    this.#session.close();
    this.snapshot = { ...this.snapshot, resourceCode: "" };
    this.publish();
  }

  setEligible(eligible: boolean): void {
    this.eligible = eligible;
    if (!eligible) this.clear();
  }

  private publish(): void {
    const capture = this.#session.current();
    const next = { ...this.snapshot, ...capture };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
