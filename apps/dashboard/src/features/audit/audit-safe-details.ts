import type { ManagementAuditEvent } from "@valet/contracts";

type Detail = ManagementAuditEvent["details"];
export type AuditDetailRow = readonly [string, string | number | boolean];

const alertTimingFields = new Set([
  "alt01GraceSeconds",
  "alt02QueueSeconds",
  "alt03DeclineSeconds",
  "alt04StageSeconds",
  "alt06HandoffSeconds",
  "alt11UnknownPaymentSeconds",
]);

function alertTimingAuditRows(detail: Detail): readonly AuditDetailRow[] {
  if (detail.kind !== "MANAGEMENT") return [];
  const metadata: Record<string, unknown> = detail;
  const changedKeys = metadata.changedKeys;
  const beforeRevision = metadata.beforeRevision;
  const afterRevision = metadata.afterRevision;
  if (
    !Array.isArray(changedKeys) || changedKeys.length === 0 ||
    changedKeys.length > alertTimingFields.size ||
    !changedKeys.every(
      (key: unknown) => typeof key === "string" && alertTimingFields.has(key),
    ) ||
    new Set(changedKeys).size !== changedKeys.length ||
    typeof beforeRevision !== "number" || !Number.isSafeInteger(beforeRevision) ||
    beforeRevision < 0 ||
    typeof afterRevision !== "number" || !Number.isSafeInteger(afterRevision) ||
    afterRevision <= beforeRevision
  ) return [];
  return [
    ["changedKeys", changedKeys.join(", ")],
    ["beforeRevision", beforeRevision],
    ["afterRevision", afterRevision],
  ];
}

export function safeAuditDetailRows(
  detail: Detail,
  eventType?: string,
): readonly AuditDetailRow[] {
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
      return [
        ...compact([
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
        ]),
        ...(eventType === "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED"
          ? alertTimingAuditRows(detail) : []),
      ];
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
