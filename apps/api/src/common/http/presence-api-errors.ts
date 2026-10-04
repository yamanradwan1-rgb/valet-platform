import type { MappedApiError } from "./api-errors";

const conflicts = new Set([
  "PRESENCE_OPERATION_CONFLICT",
  "PRESENCE_OPERATION_EXPIRED",
  "PRESENCE_CHALLENGE_EXPIRED",
  "PRESENCE_CHALLENGE_CONSUMED",
  "PRESENCE_CAS_CONFLICT",
  "PRESENCE_AUTHORITY_BUSY",
  "PRESENCE_CONFIGURATION_CONFLICT",
  "PRESENCE_INHERITED_CONTEXT_CONFLICT",
  "PRESENCE_NOT_READY",
  "PRESENCE_STRICT_ROLLOUT_CLOSED",
  "PRESENCE_MUTATION_CONFLICT",
  "PRESENCE_REVIEW_CONFLICT",
  "APPROVER_AUTHORITY_REVOKED",
]);

export function mapPresenceApiError(code: unknown): MappedApiError | undefined {
  if (typeof code !== "string") return undefined;
  if (code === "SHIFT_PRESENCE_RATE_LIMITED")
    return {
      code,
      status: 429,
      message: "Too many requests. Try again later.",
    };
  if (code === "PRESENCE_SCOPE_MISMATCH")
    return {
      code: "AUTHORIZATION_DENIED",
      status: 404,
      message: "The requested resource is not available.",
    };
  if (code === "PRESENCE_SECURITY_UNAVAILABLE")
    return {
      code,
      status: 503,
      message: "Presence verification is temporarily unavailable.",
    };
  if (code === "PRESENCE_REQUIRED" || code === "PRESENCE_REJECTED") {
    return {
      code,
      status: 422,
      message: "Presence verification is required for this Shift action.",
    };
  }
  if (conflicts.has(code))
    return {
      code,
      status: 409,
      message:
        "The presence action cannot proceed. Refresh its current result.",
    };
  return undefined;
}
