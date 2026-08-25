/**
 * Camera environment evaluation for the Employee QR scanner (DEC-067 §2).
 *
 * Pure classification logic only; browser globals are read through an
 * injectable probe so every permission/support path is testable at the
 * boundary without fabricating product behavior.
 */

export type CameraAvailability =
  | "supported"
  | "insecure-context"
  | "unavailable";

export interface CameraEnvironmentProbe {
  readonly hasMediaDevices: boolean;
  readonly isSecureContext: boolean;
}

/**
 * Reads the real browser environment. On servers/tests without a camera-capable
 * navigator this truthfully reports "unavailable" — never a fake capability.
 */
export function probeCameraEnvironment(): CameraEnvironmentProbe {
  const nav =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator | undefined);
  const mediaDevices: unknown = nav?.mediaDevices;
  const getUserMedia: unknown = mediaDevices === null || mediaDevices === undefined
    ? undefined
    : (mediaDevices as { getUserMedia?: unknown }).getUserMedia;
  const win =
    typeof window === "undefined" ? undefined : (window as Window | undefined);

  return {
    hasMediaDevices:
      typeof getUserMedia === "function",
    isSecureContext: win?.isSecureContext === true,
  };
}

export function evaluateCameraAvailability(
  probe: CameraEnvironmentProbe,
): CameraAvailability {
  if (!probe.hasMediaDevices) return "unavailable";
  if (!probe.isSecureContext) return "insecure-context";
  return "supported";
}

/** Truthful start-failure classes surfaced to the localized UX states. */
export type CameraStartFailure =
  | "denied"
  | "busy"
  | "no-device"
  | "error";

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * Classifies a getUserMedia/decoder start failure using standard DOMException
 * names; unknown failures fail closed to the generic "error" state.
 */
export function classifyCameraStartError(
  error: unknown,
): CameraStartFailure {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotReadableError":
    case "TrackStartError":
    case "OverconstrainedError":
      return "busy";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "no-device";
    default:
      return "error";
  }
}
