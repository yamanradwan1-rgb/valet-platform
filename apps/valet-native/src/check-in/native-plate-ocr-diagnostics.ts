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
  | "recognize-preflight"
  | "roi-mapped"
  | "roi-rendered"
  | "roi-encoded"
  | "roi-handoff"
  | "roi-unavailable"
  | "roi-cleanup-failure";

export interface NativePlateOcrDiagnosticDetails {
  readonly bytes?: number;
  readonly count?: number;
  readonly quality?: number;
  readonly status?: PlateOcrResponse["status"];
  readonly value?: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly cropWidth?: number;
  readonly cropHeight?: number;
  readonly mountId?: number;
  readonly revision?: number;
  readonly durationMs?: number;
}

export function logNativePlateOcr(
  classification: NativePlateOcrDiagnostic,
  details: NativePlateOcrDiagnosticDetails = {},
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  let message = `PLATE_OCR_NATIVE ${classification}`;
  for (const key of [
    "count",
    "bytes",
    "quality",
    "width",
    "height",
    "x",
    "y",
    "cropWidth",
    "cropHeight",
    "mountId",
    "revision",
    "durationMs",
  ] as const) {
    const value = details[key];
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER
    )
      message += ` ${key}=${value}`;
  }
  if (details.value && /^\d{1,5}x\d{1,5}$/.test(details.value))
    message += ` value=${details.value}`;
  if (
    ["MATCH", "NO_MATCH", "UNAVAILABLE", "RATE_LIMITED"].includes(
      details.status ?? "",
    )
  )
    message += ` status=${details.status}`;
  console.info(message);
}
