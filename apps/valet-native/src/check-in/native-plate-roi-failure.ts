export const PLATE_ROI_CAPTURE_FAILURE_REASONS = [
  "REAR_CAMERA_MISMATCH",
  "PREVIEW_METADATA_MISSING",
  "CAPTURE_USE_CASE_MISSING",
  "CAMERA_CHANGED",
  "CAPTURE_USE_CASE_CHANGED",
  "PREVIEW_CHANGED",
  "PREVIEW_TO_BUFFER_INVALID",
  "PROCESSING_GUARD_REJECTED",
  "RAW_SIZE_MISMATCH",
  "ROTATION_MISMATCH",
  "OUTPUT_SIZE_MISMATCH",
  "PROCESSED_MATRIX_INVALID",
  "PROCESSING_OOM",
  "NATIVE_CAPTURE_FAILED",
  "CAPTURE_METADATA_MISSING",
  "CAPTURE_METADATA_INVALID",
  "CAPTURE_METADATA_IDENTITY_MISMATCH",
  "PREVIEW_SIZE_MISMATCH",
] as const;

export type PlateRoiCaptureFailureReason =
  (typeof PLATE_ROI_CAPTURE_FAILURE_REASONS)[number];

const reasonSet = new Set<string>(PLATE_ROI_CAPTURE_FAILURE_REASONS);
const codePrefix = "OCR_CAPTURE_METADATA_";

export class PlateRoiCaptureDiagnosticError extends Error {
  constructor(readonly reason: PlateRoiCaptureFailureReason) {
    super("Automatic plate reading is unavailable.");
    this.name = "PlateRoiCaptureDiagnosticError";
  }
}

export function plateRoiCaptureDiagnosticCode(
  reason: PlateRoiCaptureFailureReason,
): string {
  return `${codePrefix}${reason}`;
}

export function nativePlateRoiFailureReason(
  error: unknown,
): PlateRoiCaptureFailureReason | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || !code.startsWith(codePrefix)) return undefined;
  const reason = code.slice(codePrefix.length);
  return reasonSet.has(reason)
    ? (reason as PlateRoiCaptureFailureReason)
    : undefined;
}

export function plateRoiCaptureFailureReason(
  error: unknown,
): PlateRoiCaptureFailureReason | undefined {
  return error instanceof PlateRoiCaptureDiagnosticError
    ? error.reason
    : undefined;
}
