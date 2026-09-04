import type { NativeCameraPermissionPort } from "../scanner/native-qr-controller";

export interface NativePlateCameraSnapshot {
  readonly generation: number;
  readonly phase:
    "idle" | "requesting" | "starting" | "preview" | "denied" | "error";
  readonly canAskAgain: boolean;
}

/** Visual assistance only: no frames, decoding, files, or vehicle identity. */
export class NativePlateCameraController {
  private eligible = false;
  private snapshot: NativePlateCameraSnapshot = {
    generation: 0,
    phase: "idle",
    canAskAgain: true,
  };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly permissions: NativeCameraPermissionPort) {}

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
    this.publish({ ...this.snapshot, generation, phase: "requesting" });
    try {
      let permission = await this.permissions.get();
      if (!this.isCurrent(generation)) return;
      if (!permission.granted && permission.canAskAgain)
        permission = await this.permissions.request();
      if (!this.isCurrent(generation)) return;
      this.publish({
        generation,
        phase: permission.granted ? "starting" : "denied",
        canAskAgain: permission.canAskAgain,
      });
    } catch {
      this.fail(generation);
    }
  }

  ready(generation: number): void {
    if (this.isCurrent(generation) && this.snapshot.phase === "starting") {
      this.publish({ ...this.snapshot, phase: "preview" });
    }
  }

  fail(generation: number): void {
    if (!this.isCurrent(generation)) return;
    // Expo mount errors do not reliably distinguish busy/missing hardware.
    this.publish({
      ...this.snapshot,
      generation: generation + 1,
      phase: "error",
    });
  }

  close(): void {
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

  private publish(snapshot: NativePlateCameraSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
