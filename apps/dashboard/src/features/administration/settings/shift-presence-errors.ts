import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import type { PresenceCopyKey } from "./shift-presence-copy";

export function isPresenceDenied(error: unknown) {
  return (
    error instanceof DashboardApiError &&
    ["authorization", "auth", "entitlement"].includes(error.kind)
  );
}

export function presenceErrorKey(error: unknown): PresenceCopyKey {
  if (!(error instanceof DashboardApiError)) return "genericError";
  if (error.code === "PRESENCE_AUTHORITY_BUSY") return "busyError";
  if (error.code === "PRESENCE_NOT_READY") return "notReadyError";
  if (error.code === "PRESENCE_STRICT_ROLLOUT_CLOSED")
    return "STRICT_ROLLOUT_CLOSED";
  if (error.code === "PRESENCE_SECURITY_UNAVAILABLE") return "securityError";
  if (error.kind === "conflict") return "conflict";
  if (error.kind === "authorization" || error.kind === "auth") return "denied";
  if (error.kind === "validation") return "invalid";
  return "genericError";
}

export function presenceOutcomeUnknown(error: unknown) {
  if (
    error instanceof DashboardApiError &&
    ["PRESENCE_SECURITY_UNAVAILABLE", "PRESENCE_AUTHORITY_BUSY"].includes(
      error.code,
    )
  )
    return false;
  return (
    !(error instanceof DashboardApiError) ||
    error.kind === "network" ||
    error.kind === "malformed" ||
    error.status === 408 ||
    error.status >= 500
  );
}
