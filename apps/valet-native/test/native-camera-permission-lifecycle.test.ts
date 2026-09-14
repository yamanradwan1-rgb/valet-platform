import { describe, expect, it, vi } from "vitest";
import {
  bindNativePermissionAwareAppState,
  requestNativeCameraPermission,
} from "../src/scanner/native-camera-permission-lifecycle";

function fixture() {
  let currentState = "active";
  let notify!: (state: string) => void;
  const remove = vi.fn();
  const changes = vi.fn();
  const dispose = bindNativePermissionAwareAppState(
    {
      get currentState() {
        return currentState;
      },
      addEventListener: (_event, listener) => {
        notify = listener;
        return { remove };
      },
    },
    changes,
  );
  return {
    changes,
    dispose,
    remove,
    transition: (state: string, notifyChange = true) => {
      currentState = state;
      if (notifyChange) notify(state);
    },
  };
}

describe("camera permission AppState bridge", () => {
  it("does not suspend operational ownership for transient permission UI", async () => {
    const context = fixture();
    let resolve!: (value: boolean) => void;
    const permission = requestNativeCameraPermission(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    context.transition("background");
    expect(context.changes).not.toHaveBeenCalled();
    context.transition("active", false);
    resolve(true);
    await permission;
    expect(context.changes).toHaveBeenCalledWith(true);
    expect(context.changes).not.toHaveBeenCalledWith(false);
    context.dispose();
  });

  it("applies a genuine background when permission settles there", async () => {
    const context = fixture();
    let resolve!: (value: boolean) => void;
    const permission = requestNativeCameraPermission(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    context.transition("background");
    resolve(true);
    await permission;
    expect(context.changes).toHaveBeenCalledWith(false);
    context.dispose();
    expect(context.remove).toHaveBeenCalledOnce();
  });
});
