/**
 * Fail-open + privacy-canary tests for the portable telemetry boundary
 * (MOB-024A §17/§18), split from employee-telemetry.test.ts to respect the
 * 300-line authored-file ceiling.
 */
import { describe, expect, it } from "vitest";
import {
  createEmployeeTelemetryEvent,
  isValidEmployeeTelemetryOperation,
} from "./employee-telemetry-classification";
import {
  failOpenTelemetryCollector,
  recordTelemetrySafely,
} from "./employee-telemetry-fail-open";
import {
  EMPLOYEE_TELEMETRY_OPERATIONS,
  createNoopTelemetryCollector,
  isSafeTelemetryRequestId,
  type EmployeeTelemetryCollector,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetrySource,
} from "./employee-telemetry-types";

const BANNED = [
  "Bearer",
  "Authorization",
  "passwd",
  "password",
  "hunter2",
  "script",
  "SET-COOKIE",
  "leak",
  "secret",
  "ABC1234",
  "abc def",
];
const ALL_SOURCES: EmployeeTelemetrySource[] = [
  "auth",
  "http",
  "lifecycle",
  "network",
  "ocr",
  "push",
  "recovery",
];

describe("fail-open wrappers", () => {
  it("swallows sync throws from the inner collector", () => {
    const wrapped = failOpenTelemetryCollector({
      record() {
        throw new Error("collector exploded");
      },
    });
    expect(() =>
      wrapped.record({
        classification: "foreground",
        outcome: "success",
        source: "lifecycle",
      }),
    ).not.toThrow();
  });

  it("swallows getter traps (async-ish failures)", () => {
    const hostile: EmployeeTelemetryEvent = {
      get classification(): string {
        throw new Error("getter trap");
      },
      outcome: "success",
      source: "lifecycle",
    };
    const seen: EmployeeTelemetryEvent[] = [];
    const wrapped = failOpenTelemetryCollector({
      record: (event) => {
        seen.push(event);
        void event.classification;
      },
    });
    expect(() => wrapped.record(hostile)).not.toThrow();
    expect(seen).toHaveLength(1);
  });

  it("survives recursive record calls", () => {
    let depth = 0;
    const recursive: EmployeeTelemetryCollector = {
      record(event) {
        depth += 1;
        if (depth < 3) recursive.record(event);
      },
    };
    const wrapped = failOpenTelemetryCollector(recursive);
    expect(() =>
      wrapped.record({
        classification: "online",
        outcome: "success",
        source: "network",
      }),
    ).not.toThrow();
  });

  it("recordTelemetrySafely swallows throws and still forwards", () => {
    const seen: EmployeeTelemetryEvent[] = [];
    const collector: EmployeeTelemetryCollector = {
      record: (event) => {
        if (event.source === "push") throw new Error("push sink down");
        seen.push(event);
      },
    };
    expect(() =>
      recordTelemetrySafely(collector, {
        classification: "registration-confirmed",
        outcome: "success",
        source: "push",
      }),
    ).not.toThrow();
    expect(seen).toHaveLength(0);
  });

  it("forwards to a healthy collector and business proceeds", () => {
    const seen: EmployeeTelemetryEvent[] = [];
    const wrapped = failOpenTelemetryCollector({ record: (e) => seen.push(e) });
    wrapped.record({
      classification: "match",
      outcome: "success",
      source: "ocr",
    });
    expect(seen).toHaveLength(1);
  });
});

describe("noop collector", () => {
  it("accepts every event silently", () => {
    const collector = createNoopTelemetryCollector();
    expect(() =>
      collector.record({
        classification: "offline",
        outcome: "error",
        source: "network",
      }),
    ).not.toThrow();
  });
});

describe("privacy canary (MOB-024A §17)", () => {
  it("serialized valid events match bounded patterns only", () => {
    const valid = createEmployeeTelemetryEvent({
      classification: "response",
      errorCode: "NETWORK_ERROR",
      outcome: "error",
      requestId: "req-123.45",
      source: "http",
    });
    expect(valid).toBeDefined();
    const serialized = JSON.stringify(valid);
    expect(serialized).toMatch(/^\{".*}$/);
    for (const banned of BANNED) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("has no generic metadata/extras channel on the event surface", () => {
    const event = createEmployeeTelemetryEvent({
      classification: "refresh",
      outcome: "success",
      source: "auth",
    });
    expect(event).toBeDefined();
    expect(Object.keys(event!)).toEqual([
      "classification",
      "outcome",
      "source",
    ]);
    const withExtras = { ...event, metadata: { token: "Bearer x" } };
    const sanitized = createEmployeeTelemetryEvent(withExtras as never);
    expect(JSON.stringify(sanitized)).not.toContain("Bearer");
    expect(isSafeTelemetryRequestId("Bearer x")).toBe(false);
  });

  it("provenance and classification are bounded type-level shapes", () => {
    const classification: string = "foreground";
    for (const source of ALL_SOURCES) {
      const event = createEmployeeTelemetryEvent({
        classification,
        outcome: "success",
        source,
      });
      // classification is source-scoped: only the owning source accepts it.
      if (source === "lifecycle") {
        expect(event).toBeDefined();
      } else {
        expect(event).toBeUndefined();
      }
    }
  });

  it("operation can only be a closed-table literal on serialized output", () => {
    const events = [
      createEmployeeTelemetryEvent({
        classification: "network-failure",
        operation: "task-accept",
        outcome: "error",
        source: "http",
      }),
      createEmployeeTelemetryEvent({
        classification: "dispatched",
        operation:
          "/v1/staff/valet-sessions/44444444-4444-4444-8444-444444444444/complete-handoff",
        outcome: "error",
        source: "http",
      }),
      createEmployeeTelemetryEvent({
        classification: "match",
        operation: "ABC1234",
        outcome: "success",
        source: "ocr",
      }),
      createEmployeeTelemetryEvent({
        classification: "found",
        outcome: "success",
        source: "recovery",
      }),
    ];
    const closed = new Set<string>(EMPLOYEE_TELEMETRY_OPERATIONS);
    for (const event of events) {
      expect(event).toBeDefined();
      const serialized = JSON.stringify(event);
      const parsed = JSON.parse(serialized) as { operation?: string };
      if (parsed.operation !== undefined) {
        // Any surviving operation must be a member of the closed table —
        // never a raw path, entity ID, query param or other free string.
        expect(closed.has(parsed.operation)).toBe(true);
        expect(isValidEmployeeTelemetryOperation(parsed.operation)).toBe(true);
      }
      expect(serialized).not.toContain("44444444");
      expect(serialized).not.toContain("/v1/staff");
      expect(serialized).not.toContain("ABC1234");
    }
    // Events with no operation class at all stay legitimate.
    const noOperation = events[3];
    expect(noOperation && !("operation" in noOperation)).toBe(true);
  });
});
