/**
 * Independent ADVERSARIAL business-preservation test for the MOB-024A
 * review-repair NEW correlation surfaces (written by the adversarial
 * reviewer; angle NOT covered by worker_2's suites):
 *
 * With the NEW `operation` slot populated (closed-table literal from the
 * path->operation mapper) AND the correlated bounded `requestId` attached,
 * a telemetry sink that throws on EVERY record must not change the
 * business result — the identical success payload / non-2xx response
 * envelope crosses the transport either way. (EmployeeApiError mapping
 * happens above the transport, in EmployeeClient, which is why the
 * transport-layer contract is envelope identity.)
 *
 * The general throwing-collector cases and the memory-ring bound cases
 * live in native-telemetry-business-preservation.test.ts; sanitizer
 * format-level fuzzing in native-telemetry-adversarial.test.ts; the
 * operation-slot/path-mapper attack matrix in
 * native-telemetry-adversarial-operation.test.ts (300-line authored-file
 * ceiling in docs/17).
 */
import { describe, expect, it, vi } from "vitest";
import {
  type EmployeeTelemetryEvent,
  type EmployeeTransport,
} from "@valet/employee-client";

import { NativeHttpTelemetryTransport } from "../src/telemetry/native-http-telemetry";

// validateNativeApiOrigin permits http: only when __DEV__ is true; the
// transports below are exercised with dev origins.
vi.stubGlobal("__DEV__", true);

function throwingCollector(): { record(event: EmployeeTelemetryEvent): void } {
  return {
    record: () => {
      throw new Error("sink permanently down");
    },
  };
}

describe("adversarial: operation+requestId correlation cannot change business results", () => {
  it("a success payload is identical with a throwing vs healthy collector", async () => {
    const ok = {
      payload: { result: "STARTED", shiftId: "shift-1" },
      requestId: "req-ok-1",
      status: 201,
    };
    const inner: EmployeeTransport = { execute: async () => ok };
    const healthy: EmployeeTelemetryEvent[] = [];
    const failing = new NativeHttpTelemetryTransport(
      inner,
      throwingCollector(),
    );
    const twin = new NativeHttpTelemetryTransport(inner, (event) =>
      healthy.push(event),
    );
    const request = {
      body: { targetLocationId: "77889912" },
      method: "POST" as const,
      path: "/v1/staff/shifts/start",
    };
    const failingResult = await failing.execute(request);
    const healthyResult = await twin.execute(request);
    expect(failingResult).toEqual(healthyResult);
    expect(failingResult.payload).toEqual({
      result: "STARTED",
      shiftId: "shift-1",
    });
    // The healthy twin's event carries the closed operation literal and
    // the correlated bounded requestId — and no other new material.
    expect(healthy).toHaveLength(1);
    expect(healthy[0]).toMatchObject({
      classification: "response",
      operation: "shift-start",
      outcome: "success",
      requestId: "req-ok-1",
      source: "http",
    });
    expect(Object.keys(healthy[0]!).sort()).toEqual([
      "classification",
      "durationMs",
      "operation",
      "outcome",
      "requestId",
      "source",
    ]);
  });

  it("a mapped API error envelope passes through identically with a throwing collector", async () => {
    const failure = {
      payload: {
        code: "SHIFT_LOCATION_INVALID",
        message: "The selected location is not available.",
        requestId: "req-bad-9",
      },
      requestId: "req-bad-9",
      status: 409,
    };
    const inner: EmployeeTransport = { execute: async () => failure };
    const healthy: EmployeeTelemetryEvent[] = [];
    const failing = new NativeHttpTelemetryTransport(
      inner,
      throwingCollector(),
    );
    const twin = new NativeHttpTelemetryTransport(inner, (event) =>
      healthy.push(event),
    );
    const request = {
      body: { targetLocationId: "bad" },
      method: "POST" as const,
      path: "/v1/staff/shifts/start",
    };
    // At the transport layer a non-2xx response is RETURNED, not thrown —
    // EmployeeApiError mapping happens above, in EmployeeClient. Business
    // preservation here means: the identical envelope crosses either way,
    // unaffected by a sink that throws on every record.
    const failingResult = await failing.execute(request);
    const healthyResult = await twin.execute(request);
    expect(failingResult).toBe(failure);
    expect(healthyResult).toBe(failure);
    // Error-path event also carries the closed operation literal + bounded
    // requestId from the RESPONSE envelope, never from the business error.
    expect(healthy).toHaveLength(1);
    expect(healthy[0]).toMatchObject({
      classification: "response",
      errorCode: "SHIFT_LOCATION_INVALID",
      operation: "shift-start",
      outcome: "error",
      requestId: "req-bad-9",
      source: "http",
    });
  });

  it("a network failure keeps its closed operation with no requestId", async () => {
    const healthy: EmployeeTelemetryEvent[] = [];
    const failing = new NativeHttpTelemetryTransport(
      { execute: async () => Promise.reject(new Error("network down")) },
      throwingCollector(),
    );
    const twin = new NativeHttpTelemetryTransport(
      { execute: async () => Promise.reject(new Error("network down")) },
      (event) => healthy.push(event),
    );
    const request = {
      method: "POST" as const,
      path: "/v1/staff/valet-sessions/44444444-4444-4444-8444-444444444444/start-parking",
    };
    const failingError = await failing
      .execute(request)
      .catch((error: unknown) => error);
    const healthyError = await twin
      .execute(request)
      .catch((error: unknown) => error);
    expect(failingError).toBeInstanceOf(Error);
    expect(healthyError).toEqual(failingError);
    expect(healthy).toHaveLength(1);
    expect(healthy[0]).toMatchObject({
      classification: "network-failure",
      operation: "parking-start",
      outcome: "unknown",
      source: "http",
    });
    expect(healthy[0]!.requestId).toBeUndefined();
    expect(JSON.stringify(healthy[0])).not.toContain("44444444");
  });
});
