import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraView } from "expo-camera";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import {
  deferred,
  enableTrace,
  previewMetadata,
} from "./native-plate-camera-trace-fixture";
import { readNativePlateCameraTrace } from "../src/check-in/native-plate-camera-trace";

vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("../src/check-in/native-plate-roi-crop-adapter", () => ({
  renderPlateRoi: vi.fn(),
}));
vi.mock("../src/scanner/native-camera-adapter", () => ({
  nativeCameraPermissions: {
    get: async () => ({ granted: true, canAskAgain: true }),
    request: vi.fn(),
  },
}));
const { createNativePlateOcrBinding } =
  await import("../src/check-in/native-plate-ocr-adapter");

beforeEach(() => {
  enableTrace();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function setup() {
  const binding = createNativePlateOcrBinding(
    {} as NativeAuthSession,
    {
      current: () => ({ identityGeneration: 9 }),
    } as EmployeeCheckInSession,
  );
  const sizes = vi
    .fn()
    .mockResolvedValue(["1920x1080", "1280x720", "1024x576"]);
  const camera = {
    getAvailablePictureSizesAsync: sizes,
    getPlatePreviewMetadataAsync: async () => previewMetadata,
  } as unknown as CameraView;
  const mount = () => {
    const owner = binding.controller.current();
    binding.cameraRef(camera, owner.generation, owner.mountId);
    binding.cameraLayout(owner.generation, owner.mountId, 360, 260);
    return { generation: owner.generation, mountId: owner.mountId };
  };
  return {
    binding,
    camera,
    sizes,
    mount,
    records: () =>
      readNativePlateCameraTrace().filter(
        (r) =>
          r.details.workflowGeneration ===
          binding.controller.trace.workflowGeneration,
      ),
  };
}

describe("real adapter callback attribution", () => {
  it("orders initial size discovery and remount, then rejects old ready/error/ref callbacks", async () => {
    const c = setup();
    c.binding.controller.setEligible(true);
    await c.binding.controller.open();
    const old = c.mount();
    await c.binding.cameraReady(old.generation, old.mountId);
    const current = c.mount();
    await c.binding.cameraReady(old.generation, old.mountId);
    c.binding.cameraError(old.generation, old.mountId);
    c.binding.cameraRef(null, old.generation, old.mountId);
    expect(c.binding.controller.current().phase).toBe("starting");
    for (const event of ["ready-callback", "native-error", "ref-detach"]) {
      expect(
        c
          .records()
          .filter((r) => r.event === event)
          .at(-1)?.details,
      ).toMatchObject({
        ...old,
        current: false,
        currentMountId: current.mountId,
      });
    }
    await c.binding.cameraReady(current.generation, current.mountId);
    expect(c.binding.controller.current().phase).toBe("preview");
    const records = c.records();
    const order = [
      "size-query-start",
      "size-query-complete",
      "size-selection",
      "remount-request",
      "remount-transition",
      "metadata-start",
      "preview-validated",
      "ocr-started",
    ].map((event) => records.findIndex((r) => r.event === event));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(c.sizes).toHaveBeenCalledOnce();
    c.binding.controller.close();
  });

  it("keeps the size query owner after close/reopen and never applies its late result", async () => {
    const c = setup();
    const pending = deferred<string[]>();
    c.sizes.mockReturnValueOnce(pending.promise);
    c.binding.controller.setEligible(true);
    await c.binding.controller.open();
    const old = c.mount();
    const ready = c.binding.cameraReady(old.generation, old.mountId);
    c.binding.controller.close();
    await c.binding.controller.open();
    const current = c.mount();
    pending.resolve(["1280x720"]);
    await ready;
    expect(c.binding.controller.current().pictureSize).toBeUndefined();
    expect(
      c.records().find((r) => r.event === "size-query-discard")?.details,
    ).toMatchObject({
      ...old,
      current: false,
      currentGeneration: current.generation,
      currentMountId: current.mountId,
    });
    c.binding.controller.close();
  });

  it("normalizes size discovery and native errors without serializing exception payloads", async () => {
    const c = setup();
    c.sizes.mockRejectedValueOnce(new Error("PRIVATE_PHONE_TOKEN_PATH_PLATE"));
    c.binding.controller.setEligible(true);
    await c.binding.controller.open();
    const ids = c.mount();
    await c.binding.cameraReady(ids.generation, ids.mountId);
    expect(c.binding.controller.current().phase).toBe("preview");
    c.binding.cameraError(ids.generation, ids.mountId);
    expect(c.binding.controller.current().phase).toBe("error");
    expect(c.records().some((r) => r.event === "size-query-failure")).toBe(
      true,
    );
    expect(JSON.stringify(c.records())).not.toContain("PRIVATE");
    c.binding.controller.close();
  });
});
