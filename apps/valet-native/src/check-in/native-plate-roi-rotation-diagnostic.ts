export const NATIVE_PLATE_ROTATION_DIAGNOSTIC_PREFIX =
  "OCR_CAPTURE_METADATA_ROTATION_MISMATCH";

export const NATIVE_PLATE_ROTATION_DIAGNOSTIC_MAX_LENGTH = 128;

export type PlateRoiRotationFailureSite = "EG" | "EQ" | "RD";
export type PlateRoiRotationToken = "0" | "90" | "180" | "270" | "X";
export type PlateRoiCameraXRotationToken = PlateRoiRotationToken | "U";
export type PlateRoiQuirkToken = "0" | "1" | "U";

export interface PlateRoiRotationDiagnostic {
  readonly code: string;
  readonly site: PlateRoiRotationFailureSite;
  readonly proxyRotation: PlateRoiRotationToken;
  readonly exifOrientation: string;
  readonly exifTagPresent: "0" | "1";
  readonly expoRotation: PlateRoiRotationToken;
  readonly cameraXRotation: PlateRoiCameraXRotationToken;
  readonly proxyDimensions: string;
  readonly jpegDimensions: string;
  readonly outputDimensions: string;
  readonly rotationQuirk: PlateRoiQuirkToken;
  readonly jpegMetadataQuirk: PlateRoiQuirkToken;
}

const rotation = "(?:0|90|180|270|X)";
const dimension = "(?:NA|[1-9]\\d{0,4}x[1-9]\\d{0,4})";
const diagnosticPattern = new RegExp(
  `^${NATIVE_PLATE_ROTATION_DIAGNOSTIC_PREFIX}_S(EG|EQ|RD)` +
    `_PR(${rotation})_EO([0-8]|X)_ET([01])_ER(${rotation})` +
    `_CX(0|90|180|270|X|U)_P(${dimension})_J(${dimension})` +
    `_O(${dimension})_RQ([01U])_JQ([01U])$`,
);

export function parsePlateRoiRotationDiagnosticCode(
  value: unknown,
): PlateRoiRotationDiagnostic | undefined {
  if (
    typeof value !== "string" ||
    value.length > NATIVE_PLATE_ROTATION_DIAGNOSTIC_MAX_LENGTH
  )
    return undefined;
  const match = diagnosticPattern.exec(value);
  if (!match) return undefined;
  return {
    code: value,
    site: match[1] as PlateRoiRotationFailureSite,
    proxyRotation: match[2] as PlateRoiRotationToken,
    exifOrientation: match[3]!,
    exifTagPresent: match[4] as "0" | "1",
    expoRotation: match[5] as PlateRoiRotationToken,
    cameraXRotation: match[6] as PlateRoiCameraXRotationToken,
    proxyDimensions: match[7]!,
    jpegDimensions: match[8]!,
    outputDimensions: match[9]!,
    rotationQuirk: match[10] as PlateRoiQuirkToken,
    jpegMetadataQuirk: match[11] as PlateRoiQuirkToken,
  };
}

export function isPlateRoiRotationDiagnosticCode(
  value: unknown,
): value is string {
  return parsePlateRoiRotationDiagnosticCode(value) !== undefined;
}
