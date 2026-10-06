/**
 * Native OCR telemetry mapping (MOB-024A).
 *
 * Maps bounded OCR outcomes onto the closed `ocr` vocabulary. The input is
 * ONLY the provider's status discriminator or the loop's own transition —
 * never plate text, never file URIs, never bytes, never candidate values.
 * (Bytes remain allowed in the __DEV__ console diagnostics, which is the
 * existing, unchanged behavior.)
 */
import {
  createEmployeeTelemetryEvent,
  type EmployeeTelemetryEvent,
  type PlateOcrResponse,
} from "@valet/employee-client";

import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import {
  plateRoiCaptureDiagnosticCode,
  type PlateRoiCaptureFailureReason,
} from "./native-plate-roi-failure";
import { isPlateRoiRotationDiagnosticCode } from "./native-plate-roi-rotation-diagnostic";

/** Loop-internal transitions that are not provider statuses. */
export type NativeOcrTelemetryTransition = "aborted" | "capture-unavailable";

/** Provider status / loop transition accepted by the mapper. */
export type NativeOcrTelemetryOutcome =
  PlateOcrResponse["status"] | NativeOcrTelemetryTransition;

/** Closed mapping: input discriminator -> vocabulary classification. */
const OCR_CLASSIFICATIONS: Readonly<Record<NativeOcrTelemetryOutcome, string>> =
  {
    MATCH: "match",
    NO_MATCH: "no-match",
    UNAVAILABLE: "provider-unavailable",
    aborted: "aborted",
    "capture-unavailable": "capture-unavailable",
  };

/**
 * Fail-open OCR telemetry recording into the module registry. An unmapped
 * discriminator records nothing (closed vocabulary is never widened).
 */
export function recordNativePlateOcrTelemetry(
  outcome: NativeOcrTelemetryOutcome,
  captureFailureReason?: PlateRoiCaptureFailureReason,
  rotationDiagnosticCode?: string,
): void {
  const event = mapNativePlateOcrEvent(
    outcome,
    captureFailureReason,
    rotationDiagnosticCode,
  );
  if (event === undefined) return;
  getNativeTelemetry().record(event);
}

/** Pure mapper: discriminator -> sanitized event, or undefined when unknown. */
export function mapNativePlateOcrEvent(
  outcome: NativeOcrTelemetryOutcome,
  captureFailureReason?: PlateRoiCaptureFailureReason,
  rotationDiagnosticCode?: string,
): EmployeeTelemetryEvent | undefined {
  const classification = OCR_CLASSIFICATIONS[outcome];
  if (classification === undefined) return undefined;
  return createEmployeeTelemetryEvent({
    classification,
    // MATCH/NO_MATCH are genuine provider answers; the rest are failures.
    outcome:
      outcome === "MATCH" || outcome === "NO_MATCH" ? "success" : "error",
    source: "ocr",
    errorCode:
      outcome === "capture-unavailable" && captureFailureReason !== undefined
        ? captureFailureReason === "ROTATION_MISMATCH" &&
          isPlateRoiRotationDiagnosticCode(rotationDiagnosticCode)
          ? rotationDiagnosticCode
          : plateRoiCaptureDiagnosticCode(captureFailureReason)
        : undefined,
  });
}
