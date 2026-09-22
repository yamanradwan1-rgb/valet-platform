import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { AuditCopy } from "./audit-copy";

export function auditErrorMessage(reason: unknown, t: AuditCopy): string {
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
