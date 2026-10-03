interface NativeAppStatePort {
  readonly currentState: string;
  addEventListener(
    event: "change",
    listener: (state: string) => void,
  ): { remove(): void };
}

class NativeCameraPermissionRequests {
  private pending = 0;
  private readonly listeners = new Set<() => void>();

  current = (): boolean => this.pending > 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    this.pending += 1;
    this.publish();
    try {
      return await request();
    } finally {
      this.pending -= 1;
      this.publish();
    }
  }

  private publish(): void {
    this.listeners.forEach((listener) => listener());
  }
}

const nativeCameraPermissionRequests = new NativeCameraPermissionRequests();

/** Read-only focus ownership for the opt-in plate lifecycle trace. */
export const isNativeCameraPermissionRequestPending = () =>
  nativeCameraPermissionRequests.current();

/** Marks only the short-lived OS camera permission request as system-owned UI. */
export function requestNativeCameraPermission<T>(
  request: () => Promise<T>,
): Promise<T> {
  return nativeCameraPermissionRequests.run(request);
}

/**
 * Defers a non-active transition only while camera permission UI owns focus.
 * Once that request settles, the real current AppState decides whether the
 * transition was transient or a genuine background that must be fenced.
 */
export function bindNativePermissionAwareAppState(
  appState: NativeAppStatePort,
  onActiveChange: (active: boolean) => void,
): () => void {
  let deferredNonActive = false;
  const subscription = appState.addEventListener("change", (state) => {
    if (state === "active") {
      deferredNonActive = false;
      onActiveChange(true);
    } else if (nativeCameraPermissionRequests.current()) {
      deferredNonActive = true;
    } else {
      onActiveChange(false);
    }
  });
  const unsubscribePermission = nativeCameraPermissionRequests.subscribe(() => {
    if (nativeCameraPermissionRequests.current() || !deferredNonActive) return;
    deferredNonActive = false;
    onActiveChange(appState.currentState === "active");
  });
  return () => {
    unsubscribePermission();
    subscription.remove();
  };
}
