import { describe, expect, it, vi } from "vitest";
import type { NativeAuthSnapshot } from "@valet/employee-client";
import { NativeQrController } from "../src/scanner/native-qr-controller";
import { bindNativeQrLifecycle } from "../src/scanner/native-qr-lifecycle";
import { NativeIdentityStateBoundary } from "../src/auth/identity-state-boundary";

function setup() {
  const permission = { granted: true, canAskAgain: true };
  const get = vi.fn().mockResolvedValue(permission);
  const request = vi.fn().mockResolvedValue(permission);
  const controller = new NativeQrController("key-slot", {
    get,
    request,
  });
  let authChange!: (value: NativeAuthSnapshot) => void;
  let notifyAppChange!: (value: string) => void;
  let appState = "active";
  const unsubscribe = vi.fn();
  const remove = vi.fn();
  const authenticated = {
    authGeneration: 1,
    phase: "authenticated",
  } as NativeAuthSnapshot;
  const identity = new NativeIdentityStateBoundary();
  const dispose = bindNativeQrLifecycle(controller, {
    auth: {
      current: () => authenticated,
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
  return {
    controller,
    get,
    request,
    authChange,
    appChange: (state: string) => {
      appState = state;
      notifyAppChange(state);
    },
    setAppState: (state: string) => {
      appState = state;
    },
    identity,
    dispose,
    unsubscribe,
    remove,
    authenticated,
    permission,
  };
}

describe("Native scanner immediate identity and lifecycle cleanup", () => {
  it.each(["inactive", "background"])(
    "closes on %s; foreground never restarts",
    async (state) => {
      const context = setup();
      await context.controller.open();
      const generation = context.controller.current().generation;
      context.appChange(state);
      context.controller.ready(generation);
      context.controller.barcode(generation, {
        type: "qr",
        data: "vaylet:key-slot:K-01",
      });
      expect(context.controller.current()).toMatchObject({
        phase: "idle",
        resourceCode: "",
      });
      context.appChange("active");
      expect(context.controller.current().phase).toBe("idle");
      expect(context.get).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["unauthenticated", "logging-out", "fatal"])(
    "immediately closes on auth phase %s",
    async (phase) => {
      const context = setup();
      await context.controller.open();
      const generation = context.controller.current().generation;
      context.authChange({ authGeneration: 2, phase } as NativeAuthSnapshot);
      context.controller.barcode(generation, {
        type: "qr",
        data: "vaylet:key-slot:K-01",
      });
      await context.controller.open();
      expect(context.controller.current()).toMatchObject({
        phase: "idle",
        resourceCode: "",
      });
    },
  );
  it("purges input using the real MOB-007 identity boundary", async () => {
    const context = setup();
    context.controller.manual("User-A-input");
    await context.identity.purge();
    expect(context.controller.current().resourceCode).toBe("");
    await context.controller.open();
    expect(context.get).not.toHaveBeenCalled();
  });
  it("blocks late User A decode after authenticated User B generation", async () => {
    const context = setup();
    await context.controller.open();
    const generation = context.controller.current().generation;
    context.authChange({ ...context.authenticated, authGeneration: 2 });
    context.controller.barcode(generation, {
      type: "qr",
      data: "vaylet:key-slot:K-01",
    });
    expect(context.controller.current()).toMatchObject({
      phase: "idle",
      resourceCode: "",
    });
  });
  it.each(["background", "identity", "unmount", "route/workflow exit"])(
    "fences late permission and startup on %s",
    async (exit) => {
      const context = setup();
      let resolve!: (value: typeof context.permission) => void;
      context.get.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const opening = context.controller.open();
      const generation = context.controller.current().generation;
      if (exit === "background") context.appChange("background");
      else if (exit === "identity")
        context.authChange({ ...context.authenticated, authGeneration: 2 });
      else context.dispose();
      resolve(context.permission);
      await opening;
      context.controller.ready(generation);
      expect(context.controller.current().phase).toBe("idle");
    },
  );
  it("unmount cleanup unregisters every subscription and is safe twice", () => {
    const context = setup();
    context.dispose();
    context.dispose();
    expect(context.unsubscribe).toHaveBeenCalled();
    expect(context.remove).toHaveBeenCalled();
    expect(context.controller.current().phase).toBe("idle");
  });
  it("keeps a permission-generation alive only when permission UI returns active", async () => {
    const context = setup();
    let resolve!: (value: typeof context.permission) => void;
    context.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    context.get.mockResolvedValue({ granted: false, canAskAgain: true });
    const opening = context.controller.open();
    await Promise.resolve();
    context.appChange("background");
    context.setAppState("active");
    resolve(context.permission);
    await opening;
    expect(context.controller.current().phase).toBe("starting");
  });
  it("cancels a granted permission result while genuinely backgrounded", async () => {
    const context = setup();
    let resolve!: (value: typeof context.permission) => void;
    context.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    context.get.mockResolvedValue({ granted: false, canAskAgain: true });
    const opening = context.controller.open();
    await Promise.resolve();
    context.appChange("background");
    resolve(context.permission);
    await opening;
    expect(context.controller.current().phase).toBe("idle");
  });
});
