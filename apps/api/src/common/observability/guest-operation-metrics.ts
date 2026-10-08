import type { OperationMeasurement } from "./operation-observability";

/** Only names controlled by API code may become bounded metric dimensions. */
const guestOperations = new Set([
  "GUEST_SESSION_READ",
  "GUEST_BROWSER_SESSION_ENROLL",
  "GUEST_BROWSER_SESSION_EXCHANGE",
  "GUEST_BROWSER_SESSION_END",
  "GUEST_BROWSER_SESSION_PREPARE_CONTEXT",
  "GUEST_BROWSER_SESSION_SWITCH_CONTEXT",
  "GUEST_BROWSER_SESSION_RECONCILE_SWITCH",
  "GUEST_RATING_SUBMIT",
  "GUEST_PUSH_CONFIG_READ",
  "GUEST_PUSH_REGISTRATION",
  "PAYMENT_GUEST_TIP_UPDATE",
  "PAYMENT_GUEST_PROJECTION_READ",
  "GUEST_RETRIEVAL_REQUEST",
  "GUEST_RETRIEVAL_CANCEL",
  "ISSUE_HANDOFF_VERIFICATION",
  "ROTATE_HANDOFF_VERIFICATION",
  "CHECK_IN_GUEST_ACCESS_ISSUE",
  "CHECK_IN_GUEST_ACCESS_REVOKE",
]);

type GuestErrorClass =
  "NONE" | "AUTH" | "LIMIT" | "TIMEOUT" | "DEPENDENCY" | "CONFLICT" | "OTHER";

/** Maps error detail to finite categories without exporting arbitrary strings. */
export function guestErrorClass(errorCode: unknown): GuestErrorClass {
  if (typeof errorCode !== "string") return "NONE";
  if (/RATE_LIMIT|TOO_MANY|ANTI_ABUSE/.test(errorCode)) return "LIMIT";
  if (/TIMEOUT|DEADLINE/.test(errorCode)) return "TIMEOUT";
  if (/DATABASE_UNAVAILABLE|SERVICE_UNAVAILABLE/.test(errorCode))
    return "DEPENDENCY";
  if (/CONFLICT|ALREADY_/.test(errorCode)) return "CONFLICT";
  if (
    /^(GUEST_ACCESS_|GUEST_BROWSER_SESSION_|UNAUTHORIZED|FORBIDDEN)/.test(
      errorCode,
    )
  )
    return "AUTH";
  if (/STALE/.test(errorCode)) return "AUTH";
  return "OTHER";
}

export function formatGuestOperationMetric(
  measurement: OperationMeasurement,
): string | undefined {
  if (!guestOperations.has(measurement.operation)) return undefined;
  const outcome = measurement.outcome === "SUCCESS" ? "SUCCESS" : "ERROR";
  const durationMs = Number.isFinite(measurement.durationMs)
    ? Math.max(0, Math.round(measurement.durationMs))
    : 0;
  return (
    `GUEST_OPERATION_METRIC operation=${measurement.operation}` +
    ` outcome=${outcome}` +
    ` errorCategory=${guestErrorClass(measurement.errorCode)}` +
    ` durationMs=${durationMs}`
  );
}
