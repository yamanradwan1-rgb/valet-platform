/**
 * CLOSED classification vocabulary for employee telemetry (MOB-024A §10).
 *
 * `classification` values are enumerated per {@link EmployeeTelemetrySource}.
 * There is deliberately NO generic metadata channel: a classification MUST
 * be one of the literals below for its source, or the event is rejected.
 * Never mint new values at runtime; extend this table only via a code change.
 */
import {
  EMPLOYEE_TELEMETRY_OPERATIONS,
  isSafeTelemetryRequestId,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryOperation,
  type EmployeeTelemetryOutcome,
  type EmployeeTelemetrySource,
} from "./employee-telemetry-types";

/** The closed per-source classification table. Treat as append-only. */
export const EMPLOYEE_TELEMETRY_CLASSIFICATIONS = {
  auth: ["restore", "login", "refresh", "logout", "invalidated"],
  http: ["dispatched", "response", "network-failure", "auth-loss"],
  lifecycle: ["foreground", "background", "cold-start"],
  network: ["offline", "online", "unknown"],
  ocr: [
    "capture-unavailable",
    "permission-denied",
    "provider-unavailable",
    "no-match",
    "match",
    "timeout",
    "aborted",
  ],
  push: [
    "registration-confirmed",
    "registration-unavailable",
    "registration-network-unavailable",
    "registration-reconciliation-failed",
    "token-unavailable",
    "permission-denied",
    "channel-unavailable",
  ],
  recovery: [
    "preflight",
    "reserved",
    "found",
    "retired",
    "unknown",
    "unavailable",
    "invalidated",
  ],
} as const satisfies Record<EmployeeTelemetrySource, readonly string[]>;

/** Union of every legal classification across all sources. */
export type EmployeeTelemetryClassification =
  (typeof EMPLOYEE_TELEMETRY_CLASSIFICATIONS)[EmployeeTelemetrySource][number];

/** Per-source classification literal union. */
export type EmployeeTelemetrySourceClassifications<
  S extends EmployeeTelemetrySource,
> = (typeof EMPLOYEE_TELEMETRY_CLASSIFICATIONS)[S][number];

/** Set-backed lookup for O(1) membership checks over the closed table. */
const CLASSIFICATION_SETS: Readonly<
  Record<EmployeeTelemetrySource, ReadonlySet<string>>
> = {
  auth: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.auth),
  http: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.http),
  lifecycle: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.lifecycle),
  network: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.network),
  ocr: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.ocr),
  push: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.push),
  recovery: new Set(EMPLOYEE_TELEMETRY_CLASSIFICATIONS.recovery),
};

const VALID_SOURCES: ReadonlySet<string> = new Set(
  Object.keys(EMPLOYEE_TELEMETRY_CLASSIFICATIONS),
);

/** Set-backed lookup for O(1) membership checks over the closed table. */
const VALID_OPERATIONS: ReadonlySet<string> = new Set(
  EMPLOYEE_TELEMETRY_OPERATIONS,
);

/**
 * True only when `operation` is one of the enumerated literals in the closed
 * EMPLOYEE_TELEMETRY_OPERATIONS table. Raw paths, entity IDs, plates,
 * query strings, header material and any other free string are rejected.
 */
export function isValidEmployeeTelemetryOperation(
  operation: unknown,
): operation is EmployeeTelemetryOperation {
  return typeof operation === "string" && VALID_OPERATIONS.has(operation);
}

/**
 * True only when `classification` is one of the enumerated literals for
 * `source` in the closed table above. Unknown sources, empty strings,
 * business input (plates, URLs, header values) are all rejected.
 */
export function isValidEmployeeTelemetryClassification(
  source: EmployeeTelemetrySource,
  classification: string,
): boolean {
  if (typeof source !== "string" || typeof classification !== "string") {
    return false;
  }
  const allowed = CLASSIFICATION_SETS[source as EmployeeTelemetrySource];
  return allowed !== undefined && allowed.has(classification);
}

/** Input accepted by the sanitizing factory. All fields are untrusted. */
export interface CreateEmployeeTelemetryEventInput {
  readonly source: EmployeeTelemetrySource;
  readonly classification: string;
  readonly operation?: string | undefined;
  readonly outcome: EmployeeTelemetryOutcome;
  readonly requestId?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly durationMs?: number | undefined;
}

/**
 * Strict sanitizing boundary (MOB-024A §10). Builds an
 * {@link EmployeeTelemetryEvent} from untrusted input, or returns
 * `undefined` — never throws — when the input is not representable safely:
 *
 * - `source` must be a known source.
 * - `classification` must be in the closed vocabulary for that source.
 * - `operation` not in the closed EMPLOYEE_TELEMETRY_OPERATIONS table is
 *   omitted (documented drop rule, same style as unsafe requestId) — never
 *   stored raw. Valid operations are kept verbatim.
 * - `requestId` that fails the bounded pattern is omitted (not fatal).
 * - `errorCode` that fails the bounded pattern is omitted (not fatal).
 * - `durationMs` that is negative, NaN, or non-finite is omitted.
 * - The result contains exactly the documented keys, never extras.
 */
export function createEmployeeTelemetryEvent(
  input: CreateEmployeeTelemetryEventInput,
): EmployeeTelemetryEvent | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const source = input.source;
  if (typeof source !== "string" || !VALID_SOURCES.has(source)) {
    return undefined;
  }
  if (
    typeof input.classification !== "string" ||
    !isValidEmployeeTelemetryClassification(
      source as EmployeeTelemetrySource,
      input.classification,
    )
  ) {
    return undefined;
  }
  if (
    input.outcome !== "error" &&
    input.outcome !== "success" &&
    input.outcome !== "unknown"
  ) {
    return undefined;
  }

  const safeRequestId = isSafeTelemetryRequestId(input.requestId)
    ? input.requestId
    : undefined;
  const safeErrorCode = isSafeTelemetryRequestId(input.errorCode)
    ? input.errorCode
    : undefined;
  const safeOperation =
    typeof input.operation === "string" &&
    isValidEmployeeTelemetryOperation(input.operation)
      ? input.operation
      : undefined;
  const rawDuration = input.durationMs;
  const safeDurationMs =
    typeof rawDuration === "number" &&
    Number.isFinite(rawDuration) &&
    rawDuration >= 0
      ? rawDuration
      : undefined;

  const event: {
    classification: string;
    durationMs?: number | undefined;
    errorCode?: string | undefined;
    operation?: EmployeeTelemetryOperation | undefined;
    outcome: EmployeeTelemetryOutcome;
    requestId?: string | undefined;
    source: EmployeeTelemetrySource;
  } = {
    classification: input.classification,
    outcome: input.outcome,
    source: source as EmployeeTelemetrySource,
  };
  if (safeRequestId !== undefined) event.requestId = safeRequestId;
  if (safeErrorCode !== undefined) event.errorCode = safeErrorCode;
  if (safeOperation !== undefined) event.operation = safeOperation;
  if (safeDurationMs !== undefined) event.durationMs = safeDurationMs;
  return event;
}
