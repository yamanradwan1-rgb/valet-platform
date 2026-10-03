import type { EmployeeAppearanceMode } from "./employee-palette";
import {
  parseNativeAppearance,
  serializeNativeAppearance,
  type NativeAppearanceStore,
} from "./native-appearance-store";

export interface NativeAppearanceSnapshot {
  readonly mode: EmployeeAppearanceMode;
  readonly ready: boolean;
}

/** Presentation-only owner, deliberately independent from auth/workflow owners. */
export class NativeAppearanceOwner {
  private snapshot: NativeAppearanceSnapshot = { mode: "light", ready: false };
  private readonly listeners = new Set<() => void>();
  private restoreWork: Promise<void> | undefined;
  private writeWork: Promise<void> = Promise.resolve();

  constructor(private readonly store: NativeAppearanceStore) {}
  current = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  restore(): Promise<void> {
    this.restoreWork ??= this.restoreOnce();
    return this.restoreWork;
  }

  private async restoreOnce(): Promise<void> {
    // Bound even a hung read. A late result cannot overwrite a user selection.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fallback = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 1500);
    });
    let mode: EmployeeAppearanceMode = "light";
    try {
      mode = parseNativeAppearance(
        await Promise.race([this.store.read(), fallback]),
      );
    } catch {
      /* Missing/unreadable storage safely defaults to Light. */
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    this.publish({ mode, ready: true });
  }

  select = (mode: EmployeeAppearanceMode): void => {
    if (!this.snapshot.ready || this.snapshot.mode === mode) return;
    this.publish({ mode, ready: true });
    // Serialize rapid selections so an older write never wins on restart.
    this.writeWork = this.writeWork
      .then(() => this.store.write(serializeNativeAppearance(mode)))
      .catch(() => undefined);
  };

  settled = (): Promise<void> => this.writeWork;

  private publish(snapshot: NativeAppearanceSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
