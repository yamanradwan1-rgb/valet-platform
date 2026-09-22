import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { VisitContactCopy } from "./visit-contact-copy";

export function visitContactErrorMessage(
  reason: unknown,
  t: VisitContactCopy,
): string {
  if (!(reason instanceof DashboardApiError)) return t.genericError;
  switch (reason.kind) {
    case "auth":
    case "authorization":
      return t.access;
    case "entitlement":
      return t.entitlement;
    case "mfa":
      return t.mfa;
    case "validation":
      return t.validation;
    case "network":
      return t.network;
    case "malformed":
      return t.malformed;
    default:
      return t.genericError;
  }
}

export function isVisitContactConflict(reason: unknown): boolean {
  return reason instanceof DashboardApiError && reason.kind === "conflict";
}

export function isVisitContactMfaRequired(reason: unknown): boolean {
  return reason instanceof DashboardApiError && reason.kind === "mfa";
}

export function isVisitContactAuthorityLoss(reason: unknown): boolean {
  return reason instanceof DashboardApiError && (
    reason.kind === "auth" ||
    reason.kind === "authorization" ||
    reason.kind === "entitlement" ||
    reason.kind === "mfa"
  );
}

export function isUnknownMutationOutcome(reason: unknown): boolean {
  return reason instanceof DashboardApiError && (
    reason.kind === "network" ||
    reason.kind === "malformed" ||
    reason.kind === "unknown"
  );
}

export function isAuthReconciledMutation(reason: unknown): boolean {
  return reason instanceof DashboardApiError &&
    reason.code === "AUTH_RECONCILED_RETRY_REQUIRED";
}
