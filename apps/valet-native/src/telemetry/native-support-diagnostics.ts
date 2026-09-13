/**
 * Native support diagnostics view builder (MOB-024A review fix #4).
 *
 * Pure formatting module — NO React, NO state, NO mutation. It turns the
 * sanitized telemetry snapshot ({@link NativeTelemetrySnapshot}) into
 * bounded display rows so support can read what the ring already holds.
 *
 * PRIVACY: it renders ONLY enumerated fields. Provenance is the bounded
 * {appVersion, appBuild, platform} triple; events are rendered from their
 * already-sanitized slots (source, classification, operation, outcome,
 * requestId, errorCode, durationMs — all bounded by the ring's factory).
 * There are deliberately NO timestamps in an event; none are invented.
 * Nothing here can reach a remote sink or mutate business state.
 */
import type { EmployeeTelemetryEvent } from "@valet/employee-client";

import type { NativeTelemetrySnapshot } from "./native-telemetry-types";

/** Bounded label/value display row. */
export interface NativeSupportDiagnosticsRow {
  readonly label: "appBuild" | "appVersion" | "eventCount" | "platform";
  readonly value: string;
}

/** Bounded, sanitized, support-displayable view of one snapshot. */
export interface NativeSupportDiagnosticsView {
  readonly buildRows: readonly NativeSupportDiagnosticsRow[];
  readonly eventCount: number;
  readonly eventRows: readonly string[];
}

/** Max events rendered per view — the diagnostics aid stays small. */
export const NATIVE_SUPPORT_DIAGNOSTICS_EVENT_LIMIT = 20;

/**
 * Renders one sanitized event as a compact single-line string, e.g.
 * `http response task-queue success req-1 NETWORK_ERROR 42ms`. Absent fields
 * are simply omitted — never rendered as free-form placeholders.
 */
export function nativeSupportDiagnosticsEventLine(
  event: EmployeeTelemetryEvent,
): string {
  const parts = [event.source, event.classification, event.outcome];
  if (event.operation !== undefined) parts.splice(2, 0, event.operation);
  if (event.requestId !== undefined) parts.push(event.requestId);
  if (event.errorCode !== undefined) parts.push(event.errorCode);
  if (event.durationMs !== undefined) parts.push(`${event.durationMs}ms`);
  return parts.join(" ");
}

/**
 * Builds the bounded support view: provenance rows (appVersion, appBuild,
 * platform), the ring size as a row, and the LAST `limit` events as
 * compact one-line strings. `limit` is clamped to a small bounded range;
 * events arrive oldest-first, so the most recent are taken from the tail.
 */
export function nativeSupportDiagnosticsView(
  snapshot: NativeTelemetrySnapshot,
  limit: number = NATIVE_SUPPORT_DIAGNOSTICS_EVENT_LIMIT,
): NativeSupportDiagnosticsView {
  const provenance = snapshot.provenance;
  const events = snapshot.events;
  const boundedLimit = Math.min(
    Math.max(Math.floor(limit) || 0, 0),
    NATIVE_SUPPORT_DIAGNOSTICS_EVENT_LIMIT,
  );
  const recent =
    boundedLimit === 0
      ? []
      : events.slice(Math.max(0, events.length - boundedLimit));
  return {
    buildRows: [
      { label: "appVersion", value: provenance.appVersion },
      { label: "appBuild", value: provenance.appBuild },
      { label: "platform", value: provenance.platform },
      { label: "eventCount", value: String(events.length) },
    ],
    eventCount: events.length,
    eventRows: recent.map(nativeSupportDiagnosticsEventLine),
  };
}
