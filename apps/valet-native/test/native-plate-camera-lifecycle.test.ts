import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import { bindNativePlateCameraLifecycle } from "../src/check-in/native-plate-camera-lifecycle";

function setup() {
  const granted = { granted: true, canAskAgain: true };
  const get = vi.fn().mockResolvedValue(granted);
  const request = vi.fn().mockResolvedValue(granted);
  const controller = new NativePlateCameraController({ get, request });
  let authChange!: (state: NativeAuthSnapshot) => void;
  let notifyAppChange!: (state: string) => void;
  let appState = "active";
  let checkInChange!: () => void;
  let snapshot = {
    phase: "capture",
    identityGeneration: 1,
    locationId: "location-A",
  } as EmployeeCheckInSnapshot;
  const identity = new NativeIdentityStateBoundary();
  const unsubscribe = vi.fn();
  const remove = vi.fn();
  const session = {
    current: () => snapshot,
    subscribe: (listener: () => void) => {
      checkInChange = listener;
      return unsubscribe;
    },
  } as unknown as EmployeeCheckInSession;
  const cleanup = bindNativePlateCameraLifecycle(controller, session, {
    auth: {
      current: () =>
        ({ phase: "authenticated", authGeneration: 1 }) as NativeAuthSnapshot,
      subscribe: (listener) => {
        authChange = listener;
        return unsubscribe;
      },
    },
    identity,
    appState: {
      get currentState() {
        return appState;
      },
      addEventListener: (_event, listener) => {
        notifyAppChange = listener;
        return { remove };
      },
    },
  });
  const change = (patch: Partial<EmployeeCheckInSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    checkInChange();
  };
  return {
    controller,
    get,
    request,
    granted,
    authChange,
    appChange: (state: string) => {
      appState = state;
      notifyAppChange(state);
    },
    setAppState: (state: string) => {
      appState = state;
    },
    change,
    identity,
    cleanup,
    unsubscribe,
    remove,
  };
}

describe("Assistive plate camera lifecycle", () => {
  it.each(["scope", "identity", "auth", "unmount", "inactive"])(
    "retires an ON torch on %s",
    async (exit) => {
      const context = setup();
      await context.controller.open();
      const { generation, mountId } = context.controller.current();
      context.controller.ready(generation);
      context.controller.toggleTorch(generation, mountId);
      expect(context.controller.current().torchEnabled).toBe(true);
      if (exit === "scope") context.change({ phase: "confirm" });
      if (exit === "identity") await context.identity.purge();
      if (exit === "auth")
        context.authChange({
          phase: "anonymous",
          authGeneration: 2,
        } as NativeAuthSnapshot);
      if (exit === "unmount") context.cleanup();
      if (exit === "inactive") context.appChange("inactive");
      context.controller.toggleTorch(generation, mountId);
      context.controller.ready(generation);
      expect(context.controller.current()).toMatchObject({
        phase: "idle",
        torchEnabled: false,
      });
      context.cleanup();
    },
  );
  it("requests camera permission explicitly, handles denial and never opens twice in flight", async () => {
    const context = setup();
    context.get.mockResolvedValue({ granted: false, canAskAgain: true });
    context.request.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(context.get).not.toHaveBeenCalled();
    const opening = context.controller.open();
    expect(context.controller.current().phase).toBe("requesting");
    await context.controller.open();
    await opening;
    expect(context.request).toHaveBeenCalledOnce();
    expect(context.controller.current()).toMatchObject({
      phase: "denied",
      canAskAgain: false,
    });
  });
  it("represents permission and mount failures truthfully and fences late ready", async () => {
    const context = setup();
    context.get.mockRejectedValueOnce(new Error("unavailable"));
    await context.controller.open();
    expect(context.controller.current().phase).toBe("error");
    await context.controller.open();
    const generation = context.controller.current().generation;
    context.controller.fail(generation);
    context.controller.ready(generation);
    expect(context.controller.current().phase).toBe("error");
  });
  it.each([
    "manual",
    "close",
    "background",
    "inactive",
    "confirm",
    "modal-close",
    "scope",
    "identity",
    "auth",
    "unmount",
  ])("fences pending permission and camera-ready after %s", async (exit) => {
    const context = setup();
    let resolve!: (value: typeof context.granted) => void;
    context.get.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const opening = context.controller.open();
    const generation = context.controller.current().generation;
    switch (exit) {
      case "manual":
      case "close":
        context.controller.close();
        break;
      case "background":
      case "inactive":
        context.appChange(exit);
        break;
      case "confirm":
        context.change({ phase: "confirm" });
        break;
      case "modal-close":
        context.change({ phase: "inactive" });
        break;
      case "scope":
        context.change({ locationId: "location-B" });
        break;
      case "identity":
        await context.identity.purge();
        break;
      case "auth":
        context.authChange({
          phase: "authenticated",
          authGeneration: 2,
        } as NativeAuthSnapshot);
        break;
      case "unmount":
        context.cleanup();
        break;
    }
    resolve(context.granted);
    await opening;
    context.controller.ready(generation);
    expect(context.controller.current().phase).toBe("idle");
    expect(context.request).not.toHaveBeenCalled();
  });
  it("background removes active preview and foreground requires explicit re-open", async () => {
    const context = setup();
    await context.controller.open();
    context.controller.ready(context.controller.current().generation);
    expect(context.controller.current().phase).toBe("preview");
    const { generation, mountId } = context.controller.current();
    context.controller.toggleTorch(generation, mountId);
    expect(context.controller.current().torchEnabled).toBe(true);
    context.appChange("background");
    context.appChange("active");
    expect(context.controller.current().phase).toBe("idle");
    expect(context.controller.current().torchEnabled).toBe(false);
    context.controller.toggleTorch(generation, mountId);
    expect(context.controller.current().torchEnabled).toBe(false);
    expect(context.get).toHaveBeenCalledOnce();
  });
  it("preserves the original open across transient camera permission UI", async () => {
    const context = setup();
    let resolve!: (value: typeof context.granted) => void;
    context.get.mockResolvedValue({ granted: false, canAskAgain: true });
    context.request.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const opening = context.controller.open();
    await Promise.resolve();
    context.appChange("background");
    expect(context.controller.current().phase).toBe("requesting");
    context.setAppState("active");
    resolve(context.granted);
    await opening;
    expect(context.controller.current().phase).toBe("starting");
    expect(context.request).toHaveBeenCalledOnce();
  });
  it("cancels permission completion when the app remains backgrounded", async () => {
    const context = setup();
    let resolve!: (value: typeof context.granted) => void;
    context.get.mockResolvedValue({ granted: false, canAskAgain: true });
    context.request.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const opening = context.controller.open();
    await Promise.resolve();
    context.appChange("background");
    resolve(context.granted);
    await opening;
    expect(context.controller.current().phase).toBe("idle");
  });
  it("scope/identity exit cannot be undone by foreground or a late capture snapshot", async () => {
    const context = setup();
    await context.controller.open();
    context.change({ identityGeneration: 2 });
    context.change({ phase: "capture", identityGeneration: 1 });
    context.appChange("active");
    await context.controller.open();
    expect(context.controller.current().phase).toBe("idle");
    context.cleanup();
    expect(context.unsubscribe).toHaveBeenCalledTimes(2);
    expect(context.remove).toHaveBeenCalledOnce();
  });
});
