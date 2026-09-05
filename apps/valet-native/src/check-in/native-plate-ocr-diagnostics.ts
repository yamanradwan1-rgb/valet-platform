import type { PlateOcrResponse } from "@valet/employee-client";

export type NativePlateOcrDiagnostic =
  | "camera-ready"
  | "capture-aborted"
  | "capture-exception"
  | "camera-capture-fallback"
  | "fallback-capture-no-uri"
  | "fallback-capture-start"
  | "fallback-capture-success"
  | "fallback-file-missing"
  | "fallback-file-oversize"
  | "fallback-file-uploadable"
  | "generation-stale"
  | "http-dispatch"
  | "http-exception"
  | "http-result"
  | "loop-finish"
  | "loop-start"
  | "picture-size-none"
  | "picture-size-remount"
  | "picture-size-selected"
  | "picture-sizes-loaded"
  | "preview-ready"
  | "primary-capture-no-uri"
  | "primary-capture-start"
  | "primary-capture-success"
  | "primary-file-missing"
  | "primary-file-oversize"
  | "primary-file-uploadable"
  | "recognize-file-missing"
  | "recognize-file-oversize"
  | "recognize-location-missing"
  | "recognize-preflight";

export interface NativePlateOcrDiagnosticDetails {
  readonly bytes?: number;
  readonly count?: number;
  readonly quality?: number;
  readonly status?: PlateOcrResponse["status"];
  readonly value?: string;
}

export function logNativePlateOcr(
  classification: NativePlateOcrDiagnostic,
  details: NativePlateOcrDiagnosticDetails = {},
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  let message = `PLATE_OCR_NATIVE ${classification}`;
  if (details.count !== undefined) message += ` count=${details.count}`;
  if (details.value !== undefined) message += ` value=${details.value}`;
  if (details.bytes !== undefined) message += ` bytes=${details.bytes}`;
  if (details.quality !== undefined) message += ` quality=${details.quality}`;
  if (details.status !== undefined) message += ` status=${details.status}`;
  console.info(message);
}
