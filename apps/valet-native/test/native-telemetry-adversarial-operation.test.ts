/**
 * Independent ADVERSARIAL tests for the MOB-024A review-repair NEW
 * surfaces (written by the adversarial reviewer; angles NOT covered by
 * worker_1/worker_2's suites):
 *
 * 1. The `operation` slot on the portable telemetry event: it must be a
 *    closed-table literal or absent — never raw path material, entity IDs,
 *    query strings, plate text, header syntax, or unicode payloads —
 *    through the factory, through fuzzed key spellings, and into the
 *    bounded ring.
 * 2. The native path->operation closed route-template mapper
 *    (native-http-operation.ts): hostile paths (real UUIDs, traversal,
 *    query strings, near-miss static segments, deep nesting, unicode)
 *    must map to closed-table literals ONLY, with no raw path substring
 *    ever reaching the returned literal, and must never throw.
 *
 * Format-level sanitizer fuzzing lives in
 * native-telemetry-adversarial.test.ts; business-preservation/ring-bound
 * cases in native-telemetry-business-preservation.test.ts (300-line
 * authored-file ceiling in docs/17).
 */
import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_TELEMETRY_OPERATIONS,
  createEmployeeTelemetryEvent,
  isValidEmployeeTelemetryOperation,
  type EmployeeHttpMethod,
  type EmployeeTelemetryEvent,
  type EmployeeTransportRequest,
} from "@valet/employee-client";

const { nativeHttpTelemetryOperation } =
  await import("../src/telemetry/native-http-operation");
const { BoundedTelemetryBuffer } =
  await import("../src/telemetry/native-telemetry-owner");

const REAL_UUID = "44444444-4444-4444-8444-444444444444";

/** Poisoned operation values: paths with REAL session UUIDs, plates,
 * header syntax, query strings, newlines, unicode, oversize. */
const POISONED_OPERATIONS: ReadonlyArray<string> = [
  "../../etc/passwd",
  `/v1/staff/valet-sessions/${REAL_UUID}/complete-handoff`,
  "operational-context?token=x&Bearer%20y",
  "task-queue\nrm -rf",
  "task-queue\r\nSET-COOKIE: leak=1",
  "Bearer x",
  "ABC1234",
  "operational-context ",
  " operational-context",
  "operational-сontext",
  "طلب-secret-123",
  "token\u200bhidden",
  "x".repeat(129),
  "",
  "task/accept",
  "task-accept/",
  "operational-context.other",
];

/** Hostile request paths fed to the mapper. */
const HOSTILE_PATHS: ReadonlyArray<string> = [
  "../../etc/passwd",
  "/v1/staff/../../../etc/passwd",
  `/v1/staff/valet-sessions/${REAL_UUID}/complete-handoff`,
  `/v1/staff/valet-sessions/${REAL_UUID}/complete-handoffX`,
  `/v1/staff/tasks/${REAL_UUID}/acceptX`,
  `/v1/staff/tasks/${REAL_UUID}/accept?x=1&token=secret`,
  `/v1/staff/valet-sessions/${REAL_UUID}/start-parking?token=x&y=1`,
  "/v1/staff/operational-context;DROP TABLE x",
  "/v1/staff/tasks/queue/SET-COOKIE: leak=1",
  `/v1/staff/valet-sessions/${"a/".repeat(60)}complete-handoff`,
  "/v1/staff/valet-sessions/\u0637\u0644\u0628-\u2026ID/complete-handoff",
  `/v1/staff/shifts/${REAL_UUID}/end/extra`,
  "/v1/staff/auth/native/login",
  "/v1/staff/auth/native/refresh",
  "/totally/unknown",
  "/",
  "",
  "/v1/staff/tasks/queue?x=secret&y=1",
  "/v1/staff/check-in/sessions/{id}/complete",
  "/v1/staff/check-in/sessions/{id}/complete-handoff",
  "/v1/staff/valet-sessions/{id}/start-parking",
  "/v1/staff/tasks/%2e%2e%2faccept",
  "/v1/staff/push/registrations?reg=666",
  "//v1/staff/operational-context",
];

/** Substrings that must NEVER appear in a mapper output literal. */
const LEAK_MARKERS: ReadonlyArray<string> = [
  "passwd",
  REAL_UUID,
  "44444444",
  "token",
  "secret",
  "SET-COOKIE",
  "DROP TABLE",
  "طلب",
  "%2e",
  "…",
  "/",
];

const CLOSED_OPERATIONS: ReadonlySet<string> = new Set(
  EMPLOYEE_TELEMETRY_OPERATIONS,
);

const mapOp = (method: EmployeeHttpMethod, path: string) =>
  nativeHttpTelemetryOperation({ method, path });

describe("adversarial: operation slot closed-table enforcement", () => {
  it("drops every poisoned operation value — event survives, slot absent", () => {
    for (const operation of POISONED_OPERATIONS) {
      const event = createEmployeeTelemetryEvent({
        classification: "network-failure",
        operation,
        outcome: "error",
        source: "http",
      });
      expect(event, `event for ${JSON.stringify(operation)}`).toBeDefined();
      expect(
        event?.operation,
        `operation survived: ${JSON.stringify(operation)}`,
      ).toBeUndefined();
      expect(Object.keys(event ?? {})).not.toContain("operation");
    }
  });

  it("keeps every closed-table literal verbatim through the factory", () => {
    for (const operation of EMPLOYEE_TELEMETRY_OPERATIONS) {
      const event = createEmployeeTelemetryEvent({
        classification: "response",
        operation,
        outcome: "success",
        source: "http",
      });
      expect(event?.operation, `literal ${operation}`).toBe(operation);
    }
  });

  it("fuzzed keys can never plant a poisoned operation onto an event", () => {
    const poisoned: Record<string, unknown> = {
      classification: "response",
      outcome: "success",
      source: "http",
    };
    for (const key of [
      "operation",
      "Operation",
      "OPERATION",
      "operation_id",
      "operationId",
      "op",
      "__proto__",
      "constructor",
      "path",
      "route",
    ]) {
      poisoned[key] = "../../etc/passwd";
    }
    const event = createEmployeeTelemetryEvent(
      poisoned as unknown as Parameters<typeof createEmployeeTelemetryEvent>[0],
    );
    expect(event?.operation).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("passwd");
  });

  it("a poisoned operation cannot enter the bounded ring buffer", () => {
    const ring = new BoundedTelemetryBuffer(4);
    for (const operation of POISONED_OPERATIONS) {
      ring.record({
        classification: "response",
        operation,
        outcome: "success",
        source: "http",
      } as EmployeeTelemetryEvent);
    }
    const dump = JSON.stringify(ring.current());
    expect(dump).not.toContain("passwd");
    expect(dump).not.toContain("complete-handoff");
    expect(dump).not.toContain("44444444");
    for (const event of ring.current()) {
      expect(
        event.operation === undefined ||
          isValidEmployeeTelemetryOperation(event.operation),
        `ring stored non-closed operation ${JSON.stringify(event.operation)}`,
      ).toBe(true);
    }
  });
});

describe("adversarial: native path->operation mapper", () => {
  it("returns a closed-table literal for every hostile path", () => {
    for (const path of HOSTILE_PATHS) {
      for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
        const operation = mapOp(method, path);
        expect(
          CLOSED_OPERATIONS.has(operation),
          `${method} ${JSON.stringify(path)} -> ${JSON.stringify(operation)}`,
        ).toBe(true);
      }
    }
  });

  it("never echoes any raw path substring in the returned literal", () => {
    for (const path of HOSTILE_PATHS) {
      for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
        const operation = mapOp(method, path);
        for (const marker of LEAK_MARKERS) {
          expect(
            operation,
            `${method} ${JSON.stringify(path)} -> ${JSON.stringify(operation)}`,
          ).not.toContain(marker);
        }
      }
    }
  });

  it("near-miss segments never ride their real template's literal", () => {
    // acceptX / complete-handoffX must not inherit accept/complete-handoff.
    expect(mapOp("POST", `/v1/staff/tasks/${REAL_UUID}/acceptX`)).toBe("other");
    expect(mapOp("POST", `/v1/staff/tasks/${REAL_UUID}/accept`)).toBe(
      "task-accept",
    );
    expect(
      mapOp("POST", `/v1/staff/valet-sessions/${REAL_UUID}/complete-handoffX`),
    ).toBe("other");
    expect(
      mapOp("POST", `/v1/staff/valet-sessions/${REAL_UUID}/complete-handoff`),
    ).toBe("release-complete");
  });

  it("the wrong METHOD on a known template never inherits the literal", () => {
    expect(mapOp("DELETE", "/v1/staff/tasks/queue")).toBe("other");
    expect(mapOp("GET", "/v1/staff/shifts/start")).toBe("other");
    expect(mapOp("PUT", `/v1/staff/tasks/${REAL_UUID}/accept`)).toBe("other");
    expect(
      mapOp("GET", `/v1/staff/valet-sessions/${REAL_UUID}/confirm-parked`),
    ).toBe("other");
  });

  it("maps real production routes onto their closed literal with UUID ids", () => {
    expect(mapOp("GET", "/v1/staff/operational-context")).toBe(
      "operational-context",
    );
    expect(
      mapOp("POST", `/v1/staff/valet-sessions/${REAL_UUID}/start-parking?x=1`),
    ).toBe("parking-start");
    expect(mapOp("PUT", "/v1/staff/push/registrations")).toBe(
      "push-registration",
    );
    expect(
      mapOp(
        "GET",
        `/v1/staff/valet-sessions/${REAL_UUID}/incidents/${REAL_UUID}/recovery`,
      ),
    ).toBe("incident-recovery");
  });

  it("hostile shapes cannot crash the mapper (fail to 'other', never throw)", () => {
    const hostileInputs: ReadonlyArray<unknown> = [
      null,
      undefined,
      {},
      { method: "GET" },
      { path: "/v1/staff" },
      { method: 42, path: "/v1/staff" },
      { method: "GET", path: 42 },
      { method: "GET", path: { toString: () => "/v1/staff" } },
      { method: "GET", path: "" },
    ];
    for (const input of hostileInputs) {
      let operation: string | undefined;
      expect(
        () => {
          operation = nativeHttpTelemetryOperation(
            input as unknown as EmployeeTransportRequest,
          );
        },
        `input ${JSON.stringify(input)}`,
      ).not.toThrow();
      expect(CLOSED_OPERATIONS.has(operation ?? "")).toBe(true);
    }
  });
});
