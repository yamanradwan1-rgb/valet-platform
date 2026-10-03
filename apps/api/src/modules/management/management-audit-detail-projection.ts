import type { ManagementAuditEventFamily } from "./management-audit-event-catalog";
import { projectManagementShiftAuditDetails } from "./management-audit-shift-projection";

const sessionStates = new Set([
  "CHECKING_IN",
  "AWAITING_PARKING",
  "PARKING",
  "PARKED",
  "REQUESTED",
  "RETRIEVING",
  "READY",
  "HANDOFF_PENDING",
  "COMPLETED",
  "CANCELLED",
]);
const taskStatuses = new Set([
  "QUEUED",
  "ASSIGNED",
  "ACCEPTED",
  "DECLINED",
  "REASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
const roles = new Set([
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
]);
const identityModes = new Set(["CONFIRMED_PLATE", "TEMPORARY_DESCRIPTOR"]);
const handoffMethods = new Set([
  "DYNAMIC_QR",
  "PICKUP_CODE",
  "SUPERVISOR_OVERRIDE",
]);
const incidentSeverities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const incidentTypes = new Set([
  "VEHICLE_DAMAGE",
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
  "UNAUTHORIZED_ZONE_EXIT",
  "WRONG_VEHICLE_HANDOFF_ATTEMPT",
  "PAYMENT_DISPUTE",
  "CUSTOMER_COMPLAINT",
  "EMPLOYEE_SAFETY",
  "SYSTEM_CONNECTION",
  "OTHER",
]);
const membershipStatuses = new Set(["ACTIVE", "INACTIVE"]);
const locationStatuses = new Set(["ACTIVE", "INACTIVE"]);
const mutationOperations = new Set(["SET", "CLEAR"]);
const visitContactFields = new Set(["displayName", "phoneNormalized"]);
const contactNormalizationVersions = new Set(["JORDAN_MOBILE_V1"]);
const physicalResourceTypes = new Set(["KEY_SLOT", "PARKING_SPOT"]);

function metadata(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function first(
  source: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function allowedString(value: unknown, allowed: ReadonlySet<string>) {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function settingKey(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9]{0,99}$/.test(value)
    ? value
    : undefined;
}

function currency(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : undefined;
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum
  ) {
    return undefined;
  }
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  return hasControlCharacter ? undefined : value;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function lifecycleDetails(source: Readonly<Record<string, unknown>>) {
  return compact({
    fromState: allowedString(
      first(
        source,
        "fromState",
        "from_state",
        "fromSessionState",
        "from_session_state",
      ),
      sessionStates,
    ),
    fromVersion: positiveInteger(
      first(
        source,
        "fromVersion",
        "from_version",
        "fromSessionVersion",
        "from_session_version",
      ),
    ),
    toState: allowedString(
      first(
        source,
        "toState",
        "to_state",
        "toSessionState",
        "to_session_state",
      ),
      sessionStates,
    ),
    toVersion: positiveInteger(
      first(
        source,
        "toVersion",
        "to_version",
        "toSessionVersion",
        "to_session_version",
      ),
    ),
  });
}

export function projectManagementAuditDetails(
  family: ManagementAuditEventFamily,
  value: unknown,
  eventType?: string,
): unknown {
  const source = metadata(value);
  if (family === "CHECK_IN") {
    return compact({
      kind: "CHECK_IN",
      ...lifecycleDetails(source),
      customerPresent: booleanValue(source.customerPresent),
      effectivePhotosRequired: booleanValue(source.effectivePhotosRequired),
      identityMode: allowedString(source.identityMode, identityModes),
      qualifyingPhotoPresent: booleanValue(source.qualifyingPhotoPresent),
    });
  }
  if (family === "KEY") {
    return compact({
      kind: "KEY",
      fromVersion: positiveInteger(source.fromVersion),
      toVersion: positiveInteger(source.toVersion),
    });
  }
  if (family === "TASK") {
    return compact({
      kind: "TASK",
      fromStatus: allowedString(source.fromStatus, taskStatuses),
      fromVersion: positiveInteger(source.fromVersion),
      toStatus: allowedString(source.toStatus, taskStatuses),
      toVersion: positiveInteger(source.toVersion),
    });
  }
  if (family === "SHIFT") {
    return projectManagementShiftAuditDetails(source, eventType);
  }
  if (family === "SESSION") {
    return compact({
      kind: "SESSION",
      ...lifecycleDetails(source),
      attempt: nonNegativeInteger(source.attempt),
      handoffMethod: allowedString(
        first(source, "method", "handoff_method"),
        handoffMethods,
      ),
      maxAttempts: nonNegativeInteger(
        first(source, "maxAttempts", "max_attempts"),
      ),
      terminalized: booleanValue(source.terminalized),
    });
  }
  if (family === "INCIDENT") {
    return compact({
      kind: "INCIDENT",
      severity: allowedString(source.severity, incidentSeverities),
      status: source.status === "OPEN" ? "OPEN" : undefined,
      type: allowedString(source.type, incidentTypes),
    });
  }
  if (family === "CONFIGURATION" || family === "MANAGEMENT") {
    return compact({
      kind: family,
      ...(family === "MANAGEMENT"
        ? {
            acceptingIntake: booleanValue(source.acceptingIntake),
            fromAcceptingIntake: booleanValue(source.fromAcceptingIntake),
            fromStatus: allowedString(source.fromStatus, locationStatuses),
            field: allowedString(source.field, visitContactFields),
            newCurrency: currency(source.newCurrency),
            newTimezone: boundedText(source.newTimezone, 255),
            normalizationVersion: allowedString(
              source.normalizationVersion,
              contactNormalizationVersions,
            ),
            previousCurrency: currency(source.previousCurrency),
            previousTimezone: boundedText(source.previousTimezone, 255),
            resourceCode: boundedText(source.resourceCode, 100),
            resourceType: allowedString(
              source.resourceType,
              physicalResourceTypes,
            ),
            status: allowedString(source.status, locationStatuses),
            toAcceptingIntake: booleanValue(source.toAcceptingIntake),
            toStatus: allowedString(source.toStatus, locationStatuses),
          }
        : {}),
      operation: allowedString(source.operation, mutationOperations),
      settingKey: settingKey(source.settingKey),
    });
  }
  if (family === "STAFF") {
    return compact({
      kind: "STAFF",
      locationCount: nonNegativeInteger(source.locationCount),
      newRole: allowedString(source.newRole, roles),
      newStatus: allowedString(source.newStatus, membershipStatuses),
      previousRole: allowedString(source.previousRole, roles),
      previousStatus: allowedString(source.previousStatus, membershipStatuses),
      role: allowedString(source.role, roles),
    });
  }
  return { kind: family };
}
