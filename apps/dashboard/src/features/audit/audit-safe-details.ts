import type { ManagementAuditEvent } from "@valet/contracts";

type Detail = ManagementAuditEvent["details"];
export type AuditDetailRow = readonly [string, string | number | boolean];

export function safeAuditDetailRows(detail: Detail): readonly AuditDetailRow[] {
  switch (detail.kind) {
    case "CHECK_IN":
      return compact([
        ["fromState", detail.fromState],
        ["toState", detail.toState],
        ["fromVersion", detail.fromVersion],
        ["toVersion", detail.toVersion],
        ["customerPresent", detail.customerPresent],
        ["effectivePhotosRequired", detail.effectivePhotosRequired],
        ["identityMode", detail.identityMode],
        ["qualifyingPhotoPresent", detail.qualifyingPhotoPresent],
      ]);
    case "KEY":
      return compact([
        ["fromVersion", detail.fromVersion],
        ["toVersion", detail.toVersion],
      ]);
    case "TASK":
      return compact([
        ["fromStatus", detail.fromStatus],
        ["toStatus", detail.toStatus],
        ["fromVersion", detail.fromVersion],
        ["toVersion", detail.toVersion],
      ]);
    case "SHIFT":
      return compact([
        ["fromStatus", detail.fromStatus],
        ["toStatus", detail.toStatus],
        ["status", detail.status],
      ]);
    case "SESSION":
      return compact([
        ["fromState", detail.fromState],
        ["toState", detail.toState],
        ["fromVersion", detail.fromVersion],
        ["toVersion", detail.toVersion],
        ["attempt", detail.attempt],
        ["handoffMethod", detail.handoffMethod],
        ["maxAttempts", detail.maxAttempts],
        ["terminalized", detail.terminalized],
      ]);
    case "INCIDENT":
      return compact([
        ["severity", detail.severity],
        ["status", detail.status],
        ["type", detail.type],
      ]);
    case "CONFIGURATION":
      return compact([
        ["operation", detail.operation],
        ["settingKey", detail.settingKey],
      ]);
    case "GUEST_INFORMATION":
      return [["operation", detail.operation]];
    case "STAFF":
      return compact([
        ["locationCount", detail.locationCount],
        ["newRole", detail.newRole],
        ["previousRole", detail.previousRole],
        ["role", detail.role],
        ["newStatus", detail.newStatus],
        ["previousStatus", detail.previousStatus],
      ]);
    case "MANAGEMENT":
      return compact([
        ["acceptingIntake", detail.acceptingIntake],
        ["fromAcceptingIntake", detail.fromAcceptingIntake],
        ["toAcceptingIntake", detail.toAcceptingIntake],
        ["fromStatus", detail.fromStatus],
        ["toStatus", detail.toStatus],
        ["status", detail.status],
        ["field", detail.field],
        ["newCurrency", detail.newCurrency],
        ["previousCurrency", detail.previousCurrency],
        ["newTimezone", detail.newTimezone],
        ["previousTimezone", detail.previousTimezone],
        ["normalizationVersion", detail.normalizationVersion],
        ["operation", detail.operation],
        ["settingKey", detail.settingKey],
      ]);
    case "FINANCIAL":
    case "PRESENCE":
    case "MAP":
    case "REPORT":
    case "UNKNOWN":
      return [];
  }
}

function compact(
  entries: readonly (readonly [
    string,
    string | number | boolean | undefined,
  ])[],
): readonly AuditDetailRow[] {
  const result: AuditDetailRow[] = [];
  for (const [key, value] of entries) {
    if (value !== undefined) result.push([key, value]);
  }
  return result;
}
