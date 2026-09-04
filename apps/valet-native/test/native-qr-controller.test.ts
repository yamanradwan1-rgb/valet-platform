import { describe, expect, it, vi } from "vitest";
import {
  NativeQrController,
  type CameraPermission,
} from "../src/scanner/native-qr-controller";

const granted = { granted: true, canAskAgain: true };
const denied = { granted: false, canAskAgain: false };
const qr = { type: "qr", data: "vaylet:key-slot:K-01" };
function setup(permission = granted) {
  const get = vi.fn().mockResolvedValue(permission);
  const request = vi.fn().mockResolvedValue(granted);
  const controller = new NativeQrController("key-slot", { get, request });
  return { controller, get, request };
}
function deferred() {
  let resolve!: (value: CameraPermission) => void;
  const promise = new Promise<CameraPermission>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Native QR permission and callback adapter", () => {
  it("does not probe or request permission at construction/startup", () => {
    const { controller, get, request } = setup();
    expect(controller.current().permission).toBe("not-requested");
    expect(controller.current().phase).toBe("idle");
    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it("requests only on explicit open when the OS permits asking", async () => {
    const { controller, request } = setup({
      granted: false,
      canAskAgain: true,
    });
    await controller.open();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.current().phase).toBe("starting");
  });
  it("shows denied, does not prompt when blocked, and allows manual input", async () => {
    const { controller, request } = setup(denied);
    await controller.open();
    expect(controller.current()).toMatchObject({
      phase: "denied",
      canAskAgain: false,
    });
    expect(request).not.toHaveBeenCalled();
    controller.manual("manual-01");
    expect(controller.current().resourceCode).toBe("manual-01");
  });
  it("allows explicit retry after settings grant without automatic foreground start", async () => {
    const { controller, get } = setup(denied);
    await controller.open();
    get.mockResolvedValue(granted);
    expect(controller.current().phase).toBe("denied");
    await controller.open();
    expect(controller.current().phase).toBe("starting");
  });
  it("granted permission enters starting then camera-ready enters scanning", async () => {
    const { controller } = setup();
    await controller.open();
    expect(controller.current().phase).toBe("starting");
    controller.ready(controller.current().generation);
    expect(controller.current().phase).toBe("scanning");
  });
  it("retains manual input across invalid decode and accepts valid without reopening", async () => {
    const { controller } = setup();
    controller.manual("manual-01");
    await controller.open();
    const generation = controller.current().generation;
    controller.ready(generation);
    controller.barcode(generation, { ...qr, data: "wrong" });
    const rejected = controller.current();
    controller.barcode(generation, { ...qr, data: "wrong" });
    expect(controller.current()).toBe(rejected);
    expect(rejected).toMatchObject({
      resourceCode: "manual-01",
      phase: "scanning",
      rejectionCount: 1,
    });
    controller.barcode(generation, qr);
    expect(controller.current()).toMatchObject({
      resourceCode: "K-01",
      phase: "accepted",
    });
  });
  it("ignores non-QR symbologies", async () => {
    const { controller } = setup();
    await controller.open();
    controller.barcode(controller.current().generation, {
      ...qr,
      type: "ean13",
    });
    expect(controller.current().phase).toBe("starting");
  });
  it("synchronously suppresses a burst, then explicitly rearms", async () => {
    const { controller } = setup();
    await controller.open();
    const generation = controller.current().generation;
    const accepted = vi.fn();
    controller.subscribe(() => {
      if (controller.current().phase === "accepted") accepted();
    });
    controller.barcode(generation, qr);
    controller.barcode(generation, { ...qr, data: "vaylet:key-slot:other" });
    controller.ready(generation);
    controller.fail(generation);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(controller.current().resourceCode).toBe("K-01");
    await controller.open();
    controller.barcode(controller.current().generation, qr);
    expect(accepted).toHaveBeenCalledTimes(2);
  });
  it.each(["get", "request"] as const)(
    "fences late %s permission after close",
    async (stage) => {
      const pending = deferred();
      const controller = new NativeQrController("key-slot", {
        get: () =>
          stage === "get"
            ? pending.promise
            : Promise.resolve({ granted: false, canAskAgain: true }),
        request: () => pending.promise,
      });
      const opening = controller.open();
      await Promise.resolve();
      controller.close();
      pending.resolve(granted);
      await opening;
      expect(controller.current().phase).toBe("idle");
    },
  );
  it("fences old permission completion after a new open", async () => {
    const { controller, get } = setup();
    const pending = deferred();
    get.mockReturnValueOnce(pending.promise);
    const first = controller.open();
    controller.close();
    await controller.open();
    const current = controller.current();
    pending.resolve(denied);
    await first;
    expect(controller.current()).toBe(current);
  });
  it("normalizes permission/start failures without exposing errors or clearing manual input", async () => {
    const { controller, get } = setup();
    controller.manual("K-manual");
    get.mockRejectedValue(new Error("sensitive native detail"));
    await controller.open();
    expect(controller.current()).toMatchObject({
      phase: "error",
      resourceCode: "K-manual",
    });
    expect(JSON.stringify(controller)).not.toContain("sensitive");
  });
  it("manual editing closes capture and fences already queued frames", async () => {
    const { controller } = setup();
    await controller.open();
    const generation = controller.current().generation;
    controller.manual("edited");
    controller.barcode(generation, qr);
    expect(controller.current()).toMatchObject({
      phase: "idle",
      resourceCode: "edited",
    });
  });
  it("Dynamic proof never appears in presentation/serialization and decode has no business port", async () => {
    const controller = new NativeQrController("dynamic-handoff", {
      get: async () => granted,
      request: async () => granted,
    });
    const proof = `vhq1.${"A".repeat(43)}`;
    await controller.open();
    controller.barcode(controller.current().generation, {
      type: "qr",
      data: proof,
    });
    expect(controller.current()).toMatchObject({
      phase: "accepted",
      resourceCode: "",
    });
    expect(JSON.stringify(controller)).not.toContain(proof);
    controller.clear();
    expect(controller.current().phase).toBe("idle");
  });
});
