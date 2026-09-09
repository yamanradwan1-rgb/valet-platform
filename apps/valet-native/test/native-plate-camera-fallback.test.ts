import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import type { CameraView } from "expo-camera";

const mocks = vi.hoisted(() => ({
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
    delete() {}
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
    request: async () => ({ granted: true, canAskAgain: true }),
  },
}));

vi.stubGlobal("__DEV__", true);
const { createNativePlateOcrBinding } =
  await import("../src/check-in/native-plate-ocr-adapter");

let info: ReturnType<typeof vi.spyOn>;
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

function setup(takePictureAsync: CameraView["takePictureAsync"]) {
  const state = session();
  const binding = createNativePlateOcrBinding({} as NativeAuthSession, state);
  const camera = {
    getAvailablePictureSizesAsync: async () => [
      "1920x1080",
      "1280x720",
      "1152x648",
      "1024x576",
    ],
    takePictureAsync,
  } as CameraView;
  binding.cameraRef(camera);
  return { binding, camera, state };
}

async function start(binding: ReturnType<typeof createNativePlateOcrBinding>) {
  binding.controller.setEligible(true);
  await binding.controller.open();
  const generation = binding.controller.current().generation;
  await binding.cameraReady(generation);
  await binding.cameraReady(generation);
  binding.controller.capture();
  await vi.advanceTimersByTimeAsync(0);
  return generation;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("__DEV__", true);
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.sizes.clear();
  mocks.recognize.mockReset().mockResolvedValue({
    status: "MATCH",
    candidate: { plateNumberRaw: "12-34567", confidence: 1 },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Native camera capture resolution fallback", () => {
  it("uses the preferred camera size without a fallback after capture success", async () => {
    mocks.sizes.set("preferred.jpg", 500_000);
    const takePictureAsync = vi
      .fn()
      .mockResolvedValue({ uri: "preferred.jpg" });
    const { binding } = setup(takePictureAsync);

    await start(binding);

    expect(takePictureAsync).toHaveBeenCalledOnce();
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(info.mock.calls.flat().join("\n")).not.toContain(
      "camera-capture-fallback",
    );
  });

  it("remounts once at the supported lower size and waits for readiness", async () => {
    mocks.sizes.set("lower.jpg", 500_000);
    const takePictureAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error("device failure"))
      .mockResolvedValueOnce({ uri: "lower.jpg" });
    const { binding, state } = setup(takePictureAsync);

    const generation = await start(binding);
    expect(binding.controller.current()).toMatchObject({
      phase: "starting",
      pictureSize: "1024x576",
      captureFallbackUsed: true,
    });
    expect(takePictureAsync).toHaveBeenCalledOnce();
    expect(mocks.recognize).not.toHaveBeenCalled();

    await binding.cameraReady(generation);
    await vi.advanceTimersByTimeAsync(0);
    expect(takePictureAsync).toHaveBeenCalledTimes(2);
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(state.reviewIdentity).toHaveBeenCalledOnce();
    expect(info.mock.calls.flat().join("\n")).toContain(
      "PLATE_OCR_NATIVE camera-capture-fallback",
    );
    expect(info.mock.calls.flat().join("\n")).toContain(
      "PLATE_OCR_NATIVE picture-size-selected value=1024x576",
    );
    expect(
      info.mock.calls
        .flat()
        .filter((value: unknown) =>
          String(value).includes("picture-size-remount"),
        ),
    ).toHaveLength(2);
  });

  it("ends unavailable after the one lower camera capture also throws", async () => {
    const takePictureAsync = vi.fn().mockRejectedValue(new Error("failure"));
    const { binding } = setup(takePictureAsync);

    const generation = await start(binding);
    await binding.cameraReady(generation);
    await vi.advanceTimersByTimeAsync(0);

    expect(takePictureAsync).toHaveBeenCalledTimes(2);
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(binding.controller.current().phase).toBe("unavailable");
    expect(
      info.mock.calls
        .flat()
        .filter((value: unknown) =>
          String(value).includes("camera-capture-fallback"),
        ),
    ).toHaveLength(1);
  });

  it("invalidates the pending lower capture when the camera closes", async () => {
    const takePictureAsync = vi.fn().mockRejectedValue(new Error("failure"));
    const { binding } = setup(takePictureAsync);

    const generation = await start(binding);
    binding.controller.close();
    await binding.cameraReady(generation);
    await vi.advanceTimersByTimeAsync(0);

    expect(takePictureAsync).toHaveBeenCalledOnce();
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(binding.controller.current().phase).toBe("idle");
  });

  it("keeps the JPEG quality fallback after a camera-size fallback", async () => {
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("compressed.jpg", 700_000);
    const preferredCapture = vi
      .fn()
      .mockRejectedValueOnce(new Error("device failure"));
    const fallbackCapture = vi
      .fn()
      .mockResolvedValueOnce({ uri: "large.jpg" })
      .mockResolvedValueOnce({ uri: "compressed.jpg" });
    const { binding } = setup(preferredCapture);

    const generation = await start(binding);
    binding.cameraRef({
      takePictureAsync: fallbackCapture,
    } as unknown as CameraView);
    await binding.cameraReady(generation);
    await vi.advanceTimersByTimeAsync(0);

    expect(preferredCapture).toHaveBeenCalledExactlyOnceWith({
      quality: 0.6,
      exif: false,
      base64: false,
    });
    expect(
      fallbackCapture.mock.calls.map(([options]) => options?.quality),
    ).toEqual([0.6, 0.45]);
    expect(mocks.recognize).toHaveBeenCalledOnce();
    expect(
      info.mock.calls
        .flat()
        .filter((value: unknown) => String(value).includes("http-dispatch")),
    ).toHaveLength(1);
  });
});
