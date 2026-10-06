import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeTelemetryEvent,
  PlateOcrResponse,
} from "@valet/employee-client";
import {
  NATIVE_PLATE_OCR_INTERVAL_MS,
  NATIVE_PLATE_OCR_MAX_ATTEMPTS,
  NativePlateOcrLoop,
} from "../src/check-in/native-plate-ocr-loop";
import { PlateRoiCaptureDiagnosticError } from "../src/check-in/native-plate-roi-failure";
import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} from "../src/telemetry/native-telemetry-owner";

const match: PlateOcrResponse = {
  status: "MATCH",
  candidate: { plateNumberRaw: "12-34567", confidence: 1 },
};

const detailedRotationCode =
  "OCR_CAPTURE_METADATA_ROTATION_MISMATCH_SEQ_PR90_EO6_ET1_ER0_CX90_P4032x3024_J4032x3024_O4032x3024_RQ0_JQ1";

function setup() {
  const telemetry = new BoundedTelemetryBuffer();
  installNativeTelemetry(
    new NativeTelemetryOwner(telemetry, {
      appBuild: "test",
      appVersion: "test",
      platform: "android",
    }),
  );
  const capture = vi.fn(async () => "cache://cropped-roi.jpg");
  const recognize = vi
    .fn<(uri: string, signal: AbortSignal) => Promise<PlateOcrResponse>>()
    .mockResolvedValue({ status: "NO_MATCH" });
  const remove = vi.fn(async () => undefined);
  const accept = vi.fn();
  const finished: PlateOcrResponse[] = [];
  const loop = new NativePlateOcrLoop(
    { accept, capture, recognize, remove },
    () => true,
    (_generation, result) => finished.push(result),
  );
  const events = (): readonly EmployeeTelemetryEvent[] => telemetry.current();
  return { accept, capture, events, finished, loop, recognize, remove };
}

async function runOne(loop: NativePlateOcrLoop): Promise<void> {
  expect(loop.start(1)).toBe(true);
  await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetNativeTelemetryRegistryForTests();
});

describe("Native OCR telemetry stage ownership", () => {
  it("records one bounded capture failure and no provider event for ROI rejection", async () => {
    const c = setup();
    c.capture.mockRejectedValueOnce(
      new PlateRoiCaptureDiagnosticError("PREVIEW_CHANGED"),
    );

    await runOne(c.loop);

    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.events()).toEqual([
      {
        classification: "capture-unavailable",
        errorCode: "OCR_CAPTURE_METADATA_PREVIEW_CHANGED",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("keeps a detailed rotation rejection in the capture stage and never calls recognize", async () => {
    const c = setup();
    c.capture.mockRejectedValueOnce(
      new PlateRoiCaptureDiagnosticError(
        "ROTATION_MISMATCH",
        detailedRotationCode,
      ),
    );

    await runOne(c.loop);

    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.events()).toEqual([
      {
        classification: "capture-unavailable",
        errorCode: detailedRotationCode,
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("falls back to the legacy rotation code when detailed data is malformed", async () => {
    const c = setup();
    c.capture.mockRejectedValueOnce(
      new PlateRoiCaptureDiagnosticError(
        "ROTATION_MISMATCH",
        `${detailedRotationCode}_plate-secret`,
      ),
    );

    await runOne(c.loop);

    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.events()).toEqual([
      {
        classification: "capture-unavailable",
        errorCode: "OCR_CAPTURE_METADATA_ROTATION_MISMATCH",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("never reclassifies a post-capture failure carrying a rotation-looking code", async () => {
    const c = setup();
    c.recognize.mockRejectedValueOnce({ code: detailedRotationCode });

    await runOne(c.loop);

    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).toHaveBeenCalledOnce();
    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://cropped-roi.jpg");
    expect(c.events()).toEqual([
      {
        classification: "provider-unavailable",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("records generic capture-unavailable without fabricating provider-unavailable", async () => {
    const c = setup();
    c.capture.mockRejectedValueOnce(new Error("camera failed"));

    await runOne(c.loop);

    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.events()).toEqual([
      {
        classification: "capture-unavailable",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("keeps recognize rejection post-capture and cleans the URI exactly once", async () => {
    const c = setup();
    c.recognize.mockRejectedValueOnce(new Error("network failed"));

    await runOne(c.loop);

    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).toHaveBeenCalledExactlyOnceWith(
      "cache://cropped-roi.jpg",
      expect.any(AbortSignal),
    );
    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://cropped-roi.jpg");
    expect(c.events()).toEqual([
      {
        classification: "provider-unavailable",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("preserves explicit provider UNAVAILABLE telemetry", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce({ status: "UNAVAILABLE" });

    await runOne(c.loop);

    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://cropped-roi.jpg");
    expect(c.events()).toEqual([
      {
        classification: "provider-unavailable",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("keeps MATCH and terminal NO_MATCH telemetry unchanged", async () => {
    const matched = setup();
    matched.recognize.mockResolvedValueOnce(match);
    await runOne(matched.loop);
    expect(matched.events()).toEqual([
      { classification: "match", outcome: "success", source: "ocr" },
    ]);

    resetNativeTelemetryRegistryForTests();
    const noMatch = setup();
    expect(noMatch.loop.start(1)).toBe(true);
    await vi.advanceTimersByTimeAsync(
      NATIVE_PLATE_OCR_INTERVAL_MS * NATIVE_PLATE_OCR_MAX_ATTEMPTS,
    );
    expect(noMatch.capture).toHaveBeenCalledTimes(
      NATIVE_PLATE_OCR_MAX_ATTEMPTS,
    );
    expect(noMatch.recognize).toHaveBeenCalledTimes(
      NATIVE_PLATE_OCR_MAX_ATTEMPTS,
    );
    expect(noMatch.remove).toHaveBeenCalledTimes(NATIVE_PLATE_OCR_MAX_ATTEMPTS);
    expect(noMatch.events()).toEqual([
      { classification: "no-match", outcome: "success", source: "ocr" },
    ]);
  });
});
