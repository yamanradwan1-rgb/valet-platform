import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import type { CameraView } from "expo-camera";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";

const mocks = vi.hoisted(() => ({
  deleted: [] as string[],
  events: [] as string[],
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
      mocks.events.push(`delete:${this.uri}`);
    }
  },
}));
vi.mock("../src/check-in/native-plate-ocr-client", () => ({
  recognizeNativePlate: (...args: unknown[]) => {
    mocks.events.push("provider");
    return mocks.recognize(...args);
  },
}));
vi.mock("../src/auth/native-api-http", () => ({
  resolveNativeApiOrigin: () => "http://localhost:3001",
}));
vi.mock("../src/scanner/native-camera-adapter", () => ({
  nativeCameraPermissions: {
    get: async () => ({ granted: true, canAskAgain: true }),
    request: async () => ({ granted: true, canAskAgain: true }),
  },
}));
const { createNativePlateOcrBinding, createNativePlateOcrPorts } =
  await import("../src/check-in/native-plate-ocr-adapter");

function session() {
  return {
    current: () => ({
      locationId: "11111111-1111-4111-8111-111111111111",
      vehicle: { plateCountry: "JO" },
    }),
    setVehicle: vi.fn(),
    reviewIdentity: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function setup(captures: readonly string[]) {
  const takePictureAsync = vi.fn(async ({ quality }: { quality: number }) => {
    const uri = captures[takePictureAsync.mock.calls.length - 1];
    mocks.events.push(`capture:${quality}`);
    return uri === undefined ? undefined : { uri };
  });
  const ports = createNativePlateOcrPorts(
    () => ({ takePictureAsync }) as unknown as CameraView,
    {} as NativeAuthSession,
    session(),
  );
  async function attempt(signal = new AbortController().signal) {
    let uri: string | undefined;
    try {
      uri = await ports.capture(signal);
      return await ports.recognize(uri, signal);
    } catch {
      return { status: "UNAVAILABLE" } as const;
    } finally {
      if (uri) await ports.remove(uri);
    }
  }
  return { attempt, ports, takePictureAsync };
}

beforeEach(() => {
  mocks.deleted = [];
  mocks.events = [];
  mocks.sizes.clear();
  mocks.recognize.mockReset().mockResolvedValue({ status: "MATCH" });
});
afterEach(() => vi.useRealTimers());

describe("Native bounded ANPR capture", () => {
  it("uses one primary capture, provider call and deletion when within 1 MiB", async () => {
    mocks.sizes.set("primary.jpg", 900_000);
    const c = setup(["primary.jpg"]);
    expect(await c.attempt()).toEqual({ status: "MATCH" });
    expect(c.takePictureAsync).toHaveBeenCalledExactlyOnceWith({
      quality: 0.6,
      exif: false,
      base64: false,
    });
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(mocks.deleted).toEqual(["primary.jpg"]);
  });

  it("deletes an oversize capture before one lower-quality recapture", async () => {
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("fallback.jpg", 700_000);
    const c = setup(["large.jpg", "fallback.jpg"]);
    expect(await c.attempt()).toEqual({ status: "MATCH" });
    expect(
      c.takePictureAsync.mock.calls.map(([value]) => value.quality),
    ).toEqual([0.6, 0.45]);
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(mocks.events).toEqual([
      "capture:0.6",
      "delete:large.jpg",
      "capture:0.45",
      "provider",
      "delete:fallback.jpg",
    ]);
  });

  it("deletes two oversize captures and makes zero provider calls", async () => {
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("still-large.jpg", 2_000_000);
    const c = setup(["large.jpg", "still-large.jpg"]);
    expect(await c.attempt()).toEqual({ status: "UNAVAILABLE" });
    expect(c.takePictureAsync).toHaveBeenCalledTimes(2);
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.deleted).toEqual(["large.jpg", "still-large.jpg"]);
  });

  it("deletes a late fallback after cancellation without provider/session work", async () => {
    vi.useFakeTimers();
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("late.jpg", 500_000);
    let finish!: () => void;
    const camera = {
      takePictureAsync: vi
        .fn()
        .mockResolvedValueOnce({ uri: "large.jpg" })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = () => resolve({ uri: "late.jpg" });
          }),
        ),
    };
    const state = session();
    const ports = createNativePlateOcrPorts(
      () => camera as unknown as CameraView,
      {} as NativeAuthSession,
      state,
    );
    const controller = new NativePlateCameraController(
      {
        get: async () => ({ granted: true, canAskAgain: true }),
        request: async () => ({ granted: true, canAskAgain: true }),
      },
      ports,
    );
    controller.setEligible(true);
    await controller.open();
    controller.ready(controller.current().generation);
    await vi.advanceTimersByTimeAsync(1200);
    expect(camera.takePictureAsync).toHaveBeenCalledTimes(2);
    controller.close();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.deleted).toEqual(["large.jpg", "late.jpg"]);
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(state.setVehicle).not.toHaveBeenCalled();
    expect(state.reviewIdentity).not.toHaveBeenCalled();
  });

  it("applies an exact supported pictureSize before OCR becomes ready", async () => {
    const binding = createNativePlateOcrBinding(
      {} as NativeAuthSession,
      session(),
    );
    binding.controller.setEligible(true);
    await binding.controller.open();
    binding.cameraRef({
      getAvailablePictureSizesAsync: async () => [
        "4032x3024",
        "1280x720",
        "1920x1080",
      ],
    } as CameraView);
    const generation = binding.controller.current().generation;
    await binding.cameraReady(generation);
    expect(binding.controller.current()).toMatchObject({
      phase: "starting",
      pictureSize: "1920x1080",
    });
    await binding.cameraReady(generation);
    expect(binding.controller.current().phase).toBe("preview");
    binding.controller.close();
  });

  it("uses the supported Expo default without inventing a size when enumeration is unavailable", async () => {
    const binding = createNativePlateOcrBinding(
      {} as NativeAuthSession,
      session(),
    );
    binding.controller.setEligible(true);
    await binding.controller.open();
    const generation = binding.controller.current().generation;
    await binding.cameraReady(generation);
    expect(binding.controller.current()).toMatchObject({ phase: "preview" });
    expect(binding.controller.current().pictureSize).toBeUndefined();
    binding.controller.close();
  });
});
