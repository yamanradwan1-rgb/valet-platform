import { describe, expect, it, vi } from "vitest";
import type { CameraView } from "expo-camera";
import {
  CameraCaptureFailure,
  capturePlateRoi,
  type PlateRoiCapturePorts,
} from "../src/check-in/native-plate-roi-capture";
import {
  nativePlateRoiFailureReason,
  nativePlateRoiRotationDiagnosticCode,
  PLATE_ROI_CAPTURE_FAILURE_REASONS,
  plateRoiCaptureDiagnosticCode,
  plateRoiCaptureFailureReason,
} from "../src/check-in/native-plate-roi-failure";
import { mapNativePlateOcrEvent } from "../src/check-in/native-plate-ocr-telemetry";
import { nativeSupportDiagnosticsEventLine } from "../src/telemetry/native-support-diagnostics";
import {
  roiGeometry,
  roiPicture,
  roiPreview,
} from "./native-plate-roi-test-fixture";

const VALID_ROTATION_DIAGNOSTIC =
  "OCR_CAPTURE_METADATA_ROTATION_MISMATCH_SEQ_PR90_EO6_ET1_ER0_CX90_P4032x3024_J4032x3024_O4032x3024_RQ0_JQ1";

function setup(picture: unknown) {
  const camera = { takePictureAsync: vi.fn(async () => picture) };
  const ports: PlateRoiCapturePorts = {
    camera: camera as unknown as CameraView,
    geometry: roiGeometry,
    preview: roiPreview,
    current: () => true,
    render: vi.fn(),
    inspect: vi.fn(() => ({ exists: true, size: 100 })),
    remove: vi.fn(async () => undefined),
  };
  return { camera, ports };
}

async function failureReason(picture: unknown) {
  const { ports } = setup(picture);
  try {
    await capturePlateRoi(ports, new AbortController().signal);
  } catch (error) {
    return plateRoiCaptureFailureReason(error);
  }
  return undefined;
}

describe("plate ROI capture diagnostic contract", () => {
  it("fails closed with a bounded reason when capture metadata is absent", async () => {
    const picture = {
      ...roiPicture("private-uri.jpg"),
      plateRoiMetadata: undefined,
    };
    expect(await failureReason(picture)).toBe("CAPTURE_METADATA_MISSING");
  });

  it.each([
    ["invalid matrix", { previewToImage: [0, 0, 0, 0, 0, 0, 0, 0, 1] }],
    ["invalid dimensions", { imageWidth: 0 }],
  ])("fails closed for %s", async (_name, metadataOverride) => {
    const source = roiPicture("private-uri.jpg");
    const picture = {
      ...source,
      plateRoiMetadata: { ...source.plateRoiMetadata, ...metadataOverride },
    };
    expect(await failureReason(picture)).toBe("CAPTURE_METADATA_INVALID");
  });

  it.each([
    ["generation", { generation: roiGeometry.generation + 1 }],
    ["mountId", { mountId: roiGeometry.mountId + 1 }],
    ["revision", { revision: roiGeometry.revision + 1 }],
  ])(
    "fails closed for %s identity mismatch",
    async (_name, metadataOverride) => {
      const source = roiPicture("private-uri.jpg");
      const picture = {
        ...source,
        plateRoiMetadata: { ...source.plateRoiMetadata, ...metadataOverride },
      };
      expect(await failureReason(picture)).toBe(
        "CAPTURE_METADATA_IDENTITY_MISMATCH",
      );
    },
  );

  it("accepts only the closed native error-code vocabulary", () => {
    expect(
      nativePlateRoiFailureReason({
        code: "OCR_CAPTURE_METADATA_PREVIEW_CHANGED",
      }),
    ).toBe("PREVIEW_CHANGED");
    expect(
      nativePlateRoiFailureReason({
        code: "OCR_CAPTURE_METADATA_file://private/customer/token/plate",
      }),
    ).toBeUndefined();
  });

  it("maps both legacy and detailed rotation codes to the same base reason", () => {
    expect(
      nativePlateRoiFailureReason({
        code: "OCR_CAPTURE_METADATA_ROTATION_MISMATCH",
      }),
    ).toBe("ROTATION_MISMATCH");
    expect(
      nativePlateRoiFailureReason({ code: VALID_ROTATION_DIAGNOSTIC }),
    ).toBe("ROTATION_MISMATCH");
    expect(
      nativePlateRoiRotationDiagnosticCode({ code: VALID_ROTATION_DIAGNOSTIC }),
    ).toBe(VALID_ROTATION_DIAGNOSTIC);
  });

  it("preserves a validated detailed native code through CameraCaptureFailure", async () => {
    const { camera, ports } = setup(undefined);
    camera.takePictureAsync.mockRejectedValueOnce({
      code: VALID_ROTATION_DIAGNOSTIC,
    });

    let failure: unknown;
    try {
      await capturePlateRoi(ports, new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CameraCaptureFailure);
    expect(plateRoiCaptureFailureReason(failure)).toBe("ROTATION_MISMATCH");
    expect((failure as CameraCaptureFailure).diagnosticCode).toBe(
      VALID_ROTATION_DIAGNOSTIC,
    );
    expect(ports.render).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
  });

  it("drops malformed detailed suffixes instead of forwarding them", async () => {
    const malformed = `${VALID_ROTATION_DIAGNOSTIC}_plate-secret`;
    const { camera, ports } = setup(undefined);
    camera.takePictureAsync.mockRejectedValueOnce({ code: malformed });

    let failure: unknown;
    try {
      await capturePlateRoi(ports, new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(CameraCaptureFailure);
    expect(plateRoiCaptureFailureReason(failure)).toBe("NATIVE_CAPTURE_FAILED");
    expect((failure as CameraCaptureFailure).diagnosticCode).toBeUndefined();
  });

  it("renders only bounded sanitized support diagnostic reasons", () => {
    for (const reason of PLATE_ROI_CAPTURE_FAILURE_REASONS) {
      const event = mapNativePlateOcrEvent("capture-unavailable", reason);
      expect(event).toBeDefined();
      const line = nativeSupportDiagnosticsEventLine(event!);
      expect(line).toBe(
        `ocr capture-unavailable error ${plateRoiCaptureDiagnosticCode(reason)}`,
      );
      expect(line).not.toMatch(
        /file:|cache:|plate-secret|customer-secret|token-secret/i,
      );
    }
  });
});
