import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  NativeAuthSession,
} from "@valet/employee-client";
import type { CameraView } from "expo-camera";

const mocks = vi.hoisted(() => ({
  exists: new Map<string, boolean>(),
  sizes: new Map<string, number>(),
  recognize: vi.fn(),
}));

vi.mock("expo-file-system", () => ({
  File: class {
    readonly exists: boolean;
    readonly size: number;
    constructor(private readonly uri: string) {
      this.exists = mocks.exists.get(uri) ?? true;
      this.size = mocks.sizes.get(uri) ?? 0;
    }
    delete() {
      if (this.exists) mocks.exists.set(this.uri, false);
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
    request: async () => ({ granted: true, canAskAgain: true }),
  },
}));

vi.stubGlobal("__DEV__", true);
const { createNativePlateOcrBinding, createNativePlateOcrPorts } =
  await import("../src/check-in/native-plate-ocr-adapter");

const locationId = "11111111-1111-4111-8111-111111111111";
let info: ReturnType<typeof vi.spyOn>;

function session(location: string | null = locationId) {
  return {
    current: () => ({
      locationId: location,
      vehicle: { plateCountry: "JO" },
    }),
    setVehicle: vi.fn(),
    reviewIdentity: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function messages(): string[] {
  return info.mock.calls.map(([message]: [unknown, ...unknown[]]) =>
    String(message),
  );
}

function ports(
  takePictureAsync: CameraView["takePictureAsync"],
  state = session(),
) {
  return createNativePlateOcrPorts(
    () => ({ takePictureAsync }) as CameraView,
    {} as NativeAuthSession,
    state,
  );
}

async function attempt(
  capturePorts: ReturnType<typeof createNativePlateOcrPorts>,
  signal = new AbortController().signal,
) {
  let uri: string | undefined;
  try {
    uri = await capturePorts.capture(signal);
    return await capturePorts.recognize(uri, signal);
  } catch {
    return { status: "UNAVAILABLE" } as const;
  } finally {
    if (uri) await capturePorts.remove(uri);
  }
}

beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.exists.clear();
  mocks.sizes.clear();
  mocks.recognize.mockReset().mockResolvedValue({ status: "NO_MATCH" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Native Plate OCR diagnostic trace", () => {
  it("traces picture-size selection, remount, and preview readiness", async () => {
    const binding = createNativePlateOcrBinding(
      {} as NativeAuthSession,
      session(),
    );
    binding.controller.setEligible(true);
    await binding.controller.open();
    binding.cameraRef({
      getAvailablePictureSizesAsync: async () => ["4032x3024", "1920x1080"],
    } as CameraView);
    const generation = binding.controller.current().generation;
    await binding.cameraReady(generation);
    await binding.cameraReady(generation);

    expect(messages()).toEqual([
      "PLATE_OCR_NATIVE picture-sizes-loaded count=2",
      "PLATE_OCR_NATIVE picture-size-selected value=1920x1080",
      "PLATE_OCR_NATIVE picture-size-remount",
      "PLATE_OCR_NATIVE preview-ready",
      "PLATE_OCR_NATIVE loop-start",
    ]);
    binding.controller.close();
  });

  it("traces a primary capture through HTTP dispatch", async () => {
    mocks.sizes.set("primary.jpg", 900_000);
    const capturePorts = ports(
      vi.fn().mockResolvedValue({ uri: "primary.jpg" }),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "NO_MATCH" });
    expect(messages()).toEqual([
      "PLATE_OCR_NATIVE primary-capture-start quality=0.6",
      "PLATE_OCR_NATIVE primary-capture-success",
      "PLATE_OCR_NATIVE primary-file-uploadable bytes=900000",
      "PLATE_OCR_NATIVE recognize-preflight",
      "PLATE_OCR_NATIVE http-dispatch",
      "PLATE_OCR_NATIVE http-result status=NO_MATCH",
    ]);
    expect(mocks.recognize).toHaveBeenCalledOnce();
  });

  it("traces an oversized primary through fallback and HTTP dispatch", async () => {
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("fallback.jpg", 700_000);
    const capturePorts = ports(
      vi
        .fn()
        .mockResolvedValueOnce({ uri: "large.jpg" })
        .mockResolvedValueOnce({ uri: "fallback.jpg" }),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "NO_MATCH" });
    expect(messages()).toContain(
      "PLATE_OCR_NATIVE primary-file-oversize bytes=1048577",
    );
    expect(messages()).toContain(
      "PLATE_OCR_NATIVE fallback-capture-start quality=0.45",
    );
    expect(messages()).toContain(
      "PLATE_OCR_NATIVE fallback-file-uploadable bytes=700000",
    );
    expect(messages()).toContain("PLATE_OCR_NATIVE http-dispatch");
    expect(mocks.recognize).toHaveBeenCalledOnce();
  });

  it("stops before HTTP when both captures are oversized", async () => {
    mocks.sizes.set("large.jpg", 1_048_577);
    mocks.sizes.set("still-large.jpg", 2_000_000);
    const capturePorts = ports(
      vi
        .fn()
        .mockResolvedValueOnce({ uri: "large.jpg" })
        .mockResolvedValueOnce({ uri: "still-large.jpg" }),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "UNAVAILABLE" });
    expect(messages()).toContain(
      "PLATE_OCR_NATIVE fallback-file-oversize bytes=2000000",
    );
    expect(messages()).not.toContain("PLATE_OCR_NATIVE http-dispatch");
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "missing camera",
      create: () =>
        createNativePlateOcrPorts(
          () => null,
          {} as NativeAuthSession,
          session(),
        ),
    },
    {
      name: "capture throw",
      create: () => ports(vi.fn().mockRejectedValue(new Error("private"))),
    },
  ])("classifies $name and stops before HTTP", async ({ create }) => {
    expect(await attempt(create())).toEqual({ status: "UNAVAILABLE" });
    expect(messages()).toContain("PLATE_OCR_NATIVE capture-exception");
    expect(messages()).not.toContain("PLATE_OCR_NATIVE http-dispatch");
    expect(messages().join("\n")).not.toContain("private");
  });

  it("stops before HTTP when location is missing", async () => {
    mocks.sizes.set("primary.jpg", 10);
    const capturePorts = ports(
      vi.fn().mockResolvedValue({ uri: "primary.jpg" }),
      session(null),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "UNAVAILABLE" });
    expect(messages()).toContain("PLATE_OCR_NATIVE recognize-location-missing");
    expect(messages()).not.toContain("PLATE_OCR_NATIVE http-dispatch");
  });

  it("classifies an aborted capture and stops before HTTP", async () => {
    const abort = new AbortController();
    abort.abort();
    const capturePorts = ports(
      vi.fn().mockResolvedValue({ uri: "aborted.jpg" }),
    );

    expect(await attempt(capturePorts, abort.signal)).toEqual({
      status: "UNAVAILABLE",
    });
    expect(messages()).toContain("PLATE_OCR_NATIVE capture-aborted");
    expect(messages()).not.toContain("PLATE_OCR_NATIVE http-dispatch");
  });

  it("does not leak request or exception data when HTTP fails", async () => {
    mocks.sizes.set("private-file-uri.jpg", 10);
    mocks.recognize.mockRejectedValue(
      new Error("token-secret plate-secret identity-secret"),
    );
    const capturePorts = ports(
      vi.fn().mockResolvedValue({ uri: "private-file-uri.jpg" }),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "UNAVAILABLE" });
    expect(messages()).toContain("PLATE_OCR_NATIVE http-exception");
    expect(messages().join("\n")).not.toMatch(
      /token-secret|plate-secret|identity-secret|private-file-uri/,
    );
  });

  it("emits no diagnostics outside development builds", async () => {
    vi.stubGlobal("__DEV__", false);
    mocks.sizes.set("primary.jpg", 10);
    const capturePorts = ports(
      vi.fn().mockResolvedValue({ uri: "primary.jpg" }),
    );

    expect(await attempt(capturePorts)).toEqual({ status: "NO_MATCH" });
    expect(info).not.toHaveBeenCalled();
  });
});
