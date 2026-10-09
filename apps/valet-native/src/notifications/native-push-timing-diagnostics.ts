import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import type { NativePushRouteObservation } from "./native-push-route-coordinator";

/** Stage observations, not a device FCM receipt or Android OS display clock. */
export function recordNativePushTimingStage(
  stage: "foreground-js-observed" | "notification-response-captured",
): void {
  getNativeTelemetry().record({
    classification: stage,
    outcome: "success",
    source: "push",
  });
}

/** Never attach Task, intent, device, User, or registration identifiers. */
export function recordNativePushRouteObservation(
  observation: NativePushRouteObservation,
): void {
  const duration = "durationMs" in observation &&
    Number.isFinite(observation.durationMs)
      ? Math.max(0, Math.min(60_000, Math.round(observation.durationMs)))
      : undefined;
  getNativeTelemetry().record({
    classification: observation.kind,
    outcome: observation.kind === "canonical-refresh-failed" ||
      observation.kind === "route-dropped" ? "error" : "success",
    source: "push",
    ...(duration === undefined ? {} : { durationMs: duration }),
  });
}
