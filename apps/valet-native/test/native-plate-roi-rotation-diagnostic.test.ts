import {
  createEmployeeTelemetryEvent,
  isSafeTelemetryRequestId,
} from "@valet/employee-client";
import { describe, expect, it } from "vitest";

import {
  NATIVE_PLATE_ROTATION_DIAGNOSTIC_MAX_LENGTH,
  parsePlateRoiRotationDiagnosticCode,
} from "../src/check-in/native-plate-roi-rotation-diagnostic";

export const VALID_ROTATION_DIAGNOSTIC =
  "OCR_CAPTURE_METADATA_ROTATION_MISMATCH_SEQ_PR90_EO6_ET1_ER0_CX90_P4032x3024_J4032x3024_O4032x3024_RQ0_JQ1";

describe("plate ROI rotation diagnostic grammar", () => {
  it("parses the bounded EQ record without widening telemetry", () => {
    expect(
      parsePlateRoiRotationDiagnosticCode(VALID_ROTATION_DIAGNOSTIC),
    ).toEqual({
      code: VALID_ROTATION_DIAGNOSTIC,
      site: "EQ",
      proxyRotation: "90",
      exifOrientation: "6",
      exifTagPresent: "1",
      expoRotation: "0",
      cameraXRotation: "90",
      proxyDimensions: "4032x3024",
      jpegDimensions: "4032x3024",
      outputDimensions: "4032x3024",
      rotationQuirk: "0",
      jpegMetadataQuirk: "1",
    });
    expect(VALID_ROTATION_DIAGNOSTIC.length).toBeLessThanOrEqual(
      NATIVE_PLATE_ROTATION_DIAGNOSTIC_MAX_LENGTH,
    );
    expect(isSafeTelemetryRequestId(VALID_ROTATION_DIAGNOSTIC)).toBe(true);
    expect(
      createEmployeeTelemetryEvent({
        classification: "capture-unavailable",
        errorCode: VALID_ROTATION_DIAGNOSTIC,
        outcome: "error",
        source: "ocr",
      })?.errorCode,
    ).toBe(VALID_ROTATION_DIAGNOSTIC);
  });

  it.each([
    ["unknown site", VALID_ROTATION_DIAGNOSTIC.replace("_SEQ_", "_SZZ_")],
    ["invalid rotation", VALID_ROTATION_DIAGNOSTIC.replace("_PR90_", "_PR45_")],
    [
      "negative dimension",
      VALID_ROTATION_DIAGNOSTIC.replace("_P4032x3024_", "_P-1x3024_"),
    ],
    [
      "oversized dimension",
      VALID_ROTATION_DIAGNOSTIC.replace("_J4032x3024_", "_J100000x3024_"),
    ],
    ["arbitrary suffix", `${VALID_ROTATION_DIAGNOSTIC}_PLATESECRET`],
    ["spaces", VALID_ROTATION_DIAGNOSTIC.replace("_RQ0_", "_RQ 0_")],
    ["slash", VALID_ROTATION_DIAGNOSTIC.replace("_JQ1", "_JQ1/file")],
    ["query data", VALID_ROTATION_DIAGNOSTIC.replace("_JQ1", "_JQ1?plate=ABC")],
    [
      "business text",
      VALID_ROTATION_DIAGNOSTIC.replace("_CX90_", "_CXcustomer_"),
    ],
    ["URI text", VALID_ROTATION_DIAGNOSTIC.replace("_CX90_", "_CXfile_uri_")],
  ])("rejects malformed %s detail", (_name, code) => {
    expect(parsePlateRoiRotationDiagnosticCode(code)).toBeUndefined();
  });

  it("rejects codes above the telemetry limit even if their prefix is valid", () => {
    const oversized = `${VALID_ROTATION_DIAGNOSTIC}${"A".repeat(129)}`;
    expect(oversized.length).toBeGreaterThan(128);
    expect(parsePlateRoiRotationDiagnosticCode(oversized)).toBeUndefined();
    expect(isSafeTelemetryRequestId(oversized)).toBe(false);
  });

  it("keeps the worst valid fixed grammar at 115 safe characters", () => {
    const longest =
      "OCR_CAPTURE_METADATA_ROTATION_MISMATCH_SEQ_PR270_EO8_ET1_ER270_CX270_P99999x99999_J99999x99999_O99999x99999_RQU_JQU";
    expect(longest).toHaveLength(115);
    expect(parsePlateRoiRotationDiagnosticCode(longest)?.code).toBe(longest);
    expect(isSafeTelemetryRequestId(longest)).toBe(true);
  });
});
