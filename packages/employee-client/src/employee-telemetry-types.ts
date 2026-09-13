/**
 * Platform-neutral employee telemetry vocabulary (MOB-024A).
 *
 * PRIVACY CONTRACT — invariants every implementer and consumer MUST uphold:
 *
 * 1. An {@link EmployeeTelemetryEvent} carries ONLY bounded, enumerated fields.
 *    It has NO generic metadata, extras, tags, or free-form string slots.
 * 2. Never include: tokens, Authorization headers, pickup codes, QR proofs,
 *    guest bearers, payment data, request/response bodies, plate text, image
 *    data, or any free text. No PII beyond bounded safe identifiers.
 * 3. `requestId`, when present, MUST match /^[A-Za-z0-9._-]{1,128}$/ —
 *    otherwise it must be omitted (see {@link isSafeTelemetryRequestId}).
 * 4. `classification` MUST come from the closed vocabulary in
 *    employee-telemetry-classification.ts. Never a free business string
 *    (e.g. a plate, a URL, a header value).
 * 5. `errorCode` is bounded to the same safe-identifier pattern as
 *    requestId and is either a machine error code or omitted.
 * 6. Events are operational diagnostics only — never API authority, never
 *    audit records, never session state.
 */

/** Bounded outcome for a telemetry-observed operation. */
export type EmployeeTelemetryOutcome = "error" | "success" | "unknown";

/** Bounded emitting surface for a telemetry event. */
export type EmployeeTelemetrySource =
  "auth" | "http" | "lifecycle" | "network" | "ocr" | "push" | "recovery";

/** Where the running build came from; bounded strings, no free text. */
export interface EmployeeTelemetryProvenance {
  readonly appBuild: string;
  readonly appVersion: string;
  readonly platform: string;
}

/** The complete telemetry event shape — exactly these keys, nothing else. */
export interface EmployeeTelemetryEvent {
  readonly classification: string;
  readonly durationMs?: number | undefined;
  readonly errorCode?: string | undefined;
  readonly outcome: EmployeeTelemetryOutcome;
  readonly requestId?: string | undefined;
  readonly source: EmployeeTelemetrySource;
}

/** Sink for sanitized events. Implementations MUST be fail-open. */
export interface EmployeeTelemetryCollector {
  record(event: EmployeeTelemetryEvent): void;
}

/** Bounded safe-identifier pattern shared by requestId and errorCode. */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Type guard for the bounded telemetry safe-identifier pattern
 * (/^[A-Za-z0-9._-]{1,128}$/). Anything with whitespace, control chars,
 * newlines, header syntax, or query syntax is rejected.
 */
export function isSafeTelemetryRequestId(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

/**
 * Telemetry sink that accepts (and discards) every event without effect.
 * The default collector when no platform sink is wired up.
 */
export function createNoopTelemetryCollector(): EmployeeTelemetryCollector {
  return {
    record(): void {
      /* intentionally silent */
    },
  };
}
