import {
  roiPicture,
  roiSource,
  roiImageMocks,
  roiPreview,
  mountRoiCamera,
} from "./native-plate-roi-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import type { CameraView } from "expo-camera";

const mocks = vi.hoisted(() => ({
  deleted: [] as string[],
  sizes: new Map<string, number>(),
  recognize: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    readonly exists = true;
    readonly size: number;
    constructor(private readonly uri: string) {
      this.size = mocks.sizes.get(uri) ?? 0;
    }
    delete() {
      mocks.deleted.push(this.uri);
    }
  },
}));
vi.mock("../src/check-in/native-plate-ocr-client", () => ({
  recognizeNativePlate: (...args: unknown[]) => mocks.recognize(...args),
}));
vi.mock("../src/auth/native-api-http", () => ({
  resolveNativeApiOrigin: () => "http://localhost:3001",
}));
vi.mock("../src/scanner/native-camera-adapter", () => ({
  nativeCameraPermissions: {
    get: async () => ({ granted: true, canAskAgain: true }),
    request: vi.fn(),
  },
}));
const { createNativePlateOcrBinding, createNativePlateOcrPorts } =
  await import("../src/check-in/native-plate-ocr-adapter");
const session = () =>
  ({
    current: () => ({
      locationId: "11111111-1111-4111-8111-111111111111",
      vehicle: { plateCountry: "JO" },
    }),
    setVehicle: vi.fn(),
    reviewIdentity: vi.fn(),
  }) as unknown as EmployeeCheckInSession;
function setup() {
  const camera = {
    takePictureAsync: vi.fn(async () => roiPicture("source.jpg")),
  };
  const ports = createNativePlateOcrPorts(
    () => camera as unknown as CameraView,
    {} as NativeAuthSession,
    session(),
    undefined,
    undefined,
    roiSource(camera as unknown as CameraView),
  );
  const attempt = async () => {
    let uri: string | undefined;
    try {
      uri = await ports.capture(new AbortController().signal);
      return await ports.recognize(uri, new AbortController().signal);
    } catch {
      return { status: "UNAVAILABLE" };
    } finally {
      if (uri) await ports.remove(uri);
    }
  };
  return { attempt, camera, ports };
}
beforeEach(() => {
  mocks.deleted = [];
  mocks.sizes.clear();
  mocks.recognize.mockReset().mockResolvedValue({ status: "MATCH" });
  vi.clearAllMocks();
});
describe("Native bounded cropped ANPR upload", () => {
  it("uploads only ROI, after source deletion, exactly once", async () => {
    mocks.sizes.set("source.jpg.roi-0.6.jpg", 900000);
    mocks.recognize.mockImplementation(
      async (_origin, _auth, _request, uri) => {
        expect(uri).toBe("source.jpg.roi-0.6.jpg");
        expect(mocks.deleted).toEqual(["source.jpg"]);
        return { status: "MATCH" };
      },
    );
    const c = setup();
    expect(await c.attempt()).toEqual({ status: "MATCH" });
    expect(c.camera.takePictureAsync).toHaveBeenCalledOnce();
    expect(roiImageMocks.render).toHaveBeenCalledOnce();
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(mocks.deleted).toEqual(["source.jpg", "source.jpg.roi-0.6.jpg"]);
  });
  it("performs local compression fallback before a single HTTP call", async () => {
    mocks.sizes.set("source.jpg.roi-0.6.jpg", 1048577);
    mocks.sizes.set("source.jpg.roi-0.45.jpg", 700000);
    const c = setup();
    expect(await c.attempt()).toEqual({ status: "MATCH" });
    expect(c.camera.takePictureAsync).toHaveBeenCalledOnce();
    expect(roiImageMocks.save.mock.calls).toEqual([[0.6], [0.45]]);
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(mocks.deleted).toEqual([
      "source.jpg.roi-0.6.jpg",
      "source.jpg",
      "source.jpg.roi-0.45.jpg",
    ]);
  });
  it("deletes both oversize ROIs and source with zero HTTP calls", async () => {
    mocks.sizes.set("source.jpg.roi-0.6.jpg", 1048577);
    mocks.sizes.set("source.jpg.roi-0.45.jpg", 2000000);
    const c = setup();
    expect(await c.attempt()).toEqual({ status: "UNAVAILABLE" });
    expect(c.camera.takePictureAsync).toHaveBeenCalledOnce();
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.deleted).toEqual([
      "source.jpg.roi-0.6.jpg",
      "source.jpg.roi-0.45.jpg",
      "source.jpg",
    ]);
  });
  it("fails closed when metadata is absent without rendering or HTTP", async () => {
    const c = setup();
    c.camera.takePictureAsync.mockResolvedValueOnce({
      ...roiPicture("source.jpg"),
      plateRoiMetadata: undefined,
    } as never);
    expect(await c.attempt()).toEqual({ status: "UNAVAILABLE" });
    expect(roiImageMocks.render).not.toHaveBeenCalled();
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.deleted).toEqual(["source.jpg"]);
  });
  it("independently rechecks nonzero size and limit before HTTP", async () => {
    const c = setup();
    for (const size of [0, 1048577]) {
      mocks.sizes.set("untrusted.jpg", size);
      expect(
        await c.ports.recognize("untrusted.jpg", new AbortController().signal),
      ).toEqual({ status: "UNAVAILABLE" });
    }
    expect(mocks.recognize).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "gates readiness on native metadata after supported-size remount=%s",
    async (enumeration) => {
      const binding = createNativePlateOcrBinding(
        {} as NativeAuthSession,
        session(),
      );
      binding.controller.setEligible(true);
      await binding.controller.open();
      const camera = {
        getAvailablePictureSizesAsync: enumeration
          ? async () => ["4032x3024", "1280x720", "1920x1080"]
          : vi.fn().mockRejectedValue(new Error()),
        getPlatePreviewMetadataAsync: async () => roiPreview,
      } as unknown as CameraView;
      await mountRoiCamera(binding, camera);
      if (enumeration) {
        expect(binding.controller.current().pictureSize).toBe("1280x720");
        expect(binding.controller.current().phase).toBe("starting");
        await mountRoiCamera(binding, camera);
      }
      expect(binding.controller.current().phase).toBe("preview");
      binding.controller.close();
    },
  );
});
