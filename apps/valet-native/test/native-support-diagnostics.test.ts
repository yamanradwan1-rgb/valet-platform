/**
 * Support diagnostics VIEW BUILDER tests (MOB-024A review fix #4).
 *
 * The pure formatting module turns the sanitized telemetry snapshot into
 * bounded display rows. These cases prove: provenance rows render, the
 * limit is respected and clamped, no timestamps are invented, and no
 * business data can appear because the ring only ever holds sanitized
 * events. Component-mount cases live in
 * native-support-diagnostics-card.test.tsx; cold-start cases in
 * native-cold-start-telemetry.test.ts.
 */
import {
  createEmployeeTelemetryEvent,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryProvenance,
} from "@valet/employee-client";
import { describe, expect, it } from "vitest";

import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
} from "../src/telemetry/native-telemetry-owner";
import {
  NATIVE_SUPPORT_DIAGNOSTICS_EVENT_LIMIT,
  nativeSupportDiagnosticsEventLine,
  nativeSupportDiagnosticsView,
} from "../src/telemetry/native-support-diagnostics";

const provenance: EmployeeTelemetryProvenance = {
  appBuild: "101",
  appVersion: "1.4.0",
  platform: "android",
};

function event(
  overrides: Partial<EmployeeTelemetryEvent> = {},
): EmployeeTelemetryEvent {
  return {
    classification: "response",
    durationMs: 42,
    errorCode: "NETWORK_ERROR",
    operation: "task-queue",
    outcome: "error",
    requestId: "req-1",
    source: "http",
    ...overrides,
  };
}

function snapshotOf(events: readonly EmployeeTelemetryEvent[]) {
  return { events, provenance };
}

describe("support diagnostics view builder", () => {
  it("renders bounded provenance rows and compact event lines with every optional field", () => {
    const view = nativeSupportDiagnosticsView(
      snapshotOf([
        event(),
        event({
          classification: "found",
          durationMs: undefined,
          errorCode: undefined,
          operation: undefined,
          outcome: "success",
          requestId: undefined,
          source: "recovery",
        }),
      ]),
    );
    expect(view.buildRows).toEqual([
      { label: "appVersion", value: "1.4.0" },
      { label: "appBuild", value: "101" },
      { label: "platform", value: "android" },
      { label: "eventCount", value: "2" },
    ]);
    expect(view.eventCount).toBe(2);
    expect(view.eventRows).toEqual([
      "http response task-queue error req-1 NETWORK_ERROR 42ms",
      "recovery found success",
    ]);
  });

  it("keeps a single event line compact and omits absent optional fields", () => {
    expect(nativeSupportDiagnosticsEventLine(event())).toBe(
      "http response task-queue error req-1 NETWORK_ERROR 42ms",
    );
    expect(
      nativeSupportDiagnosticsEventLine({
        classification: "cold-start",
        outcome: "success",
        source: "lifecycle",
      }),
    ).toBe("lifecycle cold-start success");
  });

  it("respects the limit: 11 events with limit 10 render exactly 10 rows", () => {
    const events = Array.from({ length: 11 }, (_, index) =>
      event({
        classification: "found",
        requestId: `req-${index}`,
        source: "recovery",
      }),
    );
    const view = nativeSupportDiagnosticsView(snapshotOf(events), 10);
    expect(view.eventRows).toHaveLength(10);
    // Oldest dropped; the most recent (req-10) is kept.
    expect(view.eventRows.at(-1)).toContain("req-10");
    expect(view.eventRows.at(-1)).not.toContain("req-0");
    expect(view.eventRows[0]).toContain("req-1");
  });

  it("clamps the limit to the bounded diagnostics maximum", () => {
    expect(NATIVE_SUPPORT_DIAGNOSTICS_EVENT_LIMIT).toBe(20);
    const events = Array.from({ length: 50 }, (_, index) =>
      event({ requestId: `req-${index}` }),
    );
    expect(
      nativeSupportDiagnosticsView(snapshotOf(events), 9_999).eventRows,
    ).toHaveLength(20);
    expect(
      nativeSupportDiagnosticsView(snapshotOf(events), 0).eventRows,
    ).toEqual([]);
    // Event count is the ring size, not the rendered slice.
    expect(nativeSupportDiagnosticsView(snapshotOf(events)).eventCount).toBe(
      50,
    );
  });

  it("renders no invented timestamps and no business data can appear", () => {
    // A hostile caller cannot leak business data through the view: the
    // sanitizing factory rejects any classification outside the closed
    // vocabulary before an event can ever reach a snapshot, so the view
    // only ever sees sanitized events.
    expect(
      createEmployeeTelemetryEvent({
        classification: "https://api.vaylet.example/v1/staff?plate=AB-12-34",
        outcome: "success",
        requestId: "req https://evil.example/x",
        source: "http",
      }),
    ).toBeUndefined();
    const view = nativeSupportDiagnosticsView(snapshotOf([event()]));
    const rendered = JSON.stringify(view);
    expect(rendered).not.toContain("plate");
    expect(rendered).not.toContain("AB-12-34");
    expect(rendered).not.toMatch(/20\d\d-\d\d-\d\dT/);
    expect(view.eventRows).toEqual([
      "http response task-queue error req-1 NETWORK_ERROR 42ms",
    ]);
  });

  it("renders only known-safe substrings from ring-sanitized events", () => {
    // Build events through the real sanitizing factory/ring exactly as
    // production does, so "known-safe" is proven end to end.
    const buffer = new BoundedTelemetryBuffer();
    installNativeTelemetry(new NativeTelemetryOwner(buffer, provenance));
    getNativeTelemetry().record({
      classification: "response",
      durationMs: 7,
      operation: "task-queue",
      outcome: "success",
      requestId: "req-abc",
      source: "http",
    });
    const view = nativeSupportDiagnosticsView(getNativeTelemetry().snapshot());
    expect(view.eventRows).toEqual([
      "http response task-queue success req-abc 7ms",
    ]);
    for (const row of view.eventRows) {
      for (const token of row.split(" ")) {
        expect(
          /^[A-Za-z0-9._-]+$|^\d+ms$/.test(token),
          `unsafe token ${token}`,
        ).toBe(true);
      }
    }
  });
});
