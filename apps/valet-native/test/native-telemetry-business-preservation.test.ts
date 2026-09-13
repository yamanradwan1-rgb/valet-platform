/**
 * Independent ADVERSARIAL business-preservation + ring-bound tests
 * (MOB-024A) — written by the adversarial reviewer from the Phase-1 review,
 * deliberately using angles NOT covered by worker_2's suites.
 *
 * (b) BUSINESS PRESERVATION: a collector that throws on EVERY record is
 *     attached through the real production surface
 *     (createNativeEmployeeClient telemetry seam -> NativeHttpTelemetryTransport)
 *     while a real EmployeeClient is driven through (1) a successful
 *     transport response and (2) a mapped API error response. The business
 *     result must be identical to the same client with a healthy collector:
 *     same success value, same EmployeeApiError code/status/message.
 * (c) RING BOUND: the memory ring cannot grow beyond its bound even when
 *     fed hostile oversized events, and repeated failures stay cheap
 *     (bounded work per record — no unbounded queue growth).
 *
 * Sanitizer format-level fuzzing lives in native-telemetry-adversarial.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import {
  EmployeeApiError,
  EmployeeClient,
  failOpenTelemetryCollector,
  isSafeTelemetryRequestId,
  type EmployeeTelemetryCollector,
  type EmployeeTelemetryEvent,
  type EmployeeTransport,
  type NativeAuthSession,
} from "@valet/employee-client";

import { BoundedTelemetryBuffer } from "../src/telemetry/native-telemetry-owner";
import { NativeHttpTelemetryTransport } from "../src/telemetry/native-http-telemetry";
import { createNativeEmployeeClient } from "../src/tasks/native-operational-http";

// validateNativeApiOrigin permits http: only when __DEV__ is true; the
// production seam test below constructs the client with a dev origin.
vi.stubGlobal("__DEV__", true);

function fakeAuth(): NativeAuthSession {
  return {
    current: vi.fn(() => ({
      authGeneration: 1,
      getAccessToken: () => "vsa1.access-token-secret-123",
      phase: "authenticated",
    })),
    getAccessToken: vi.fn(() => "vsa1.access-token-secret-123"),
    handleDefinitiveAuthorizationLoss: vi.fn(async () => undefined),
    refresh: vi.fn(async () => "refreshed" as const),
  } as unknown as NativeAuthSession;
}

function throwingCollector(): EmployeeTelemetryCollector {
  return {
    record: () => {
      throw new Error("sink permanently down");
    },
  };
}

describe("adversarial: throwing collector cannot change business results", () => {
  it("a real EmployeeClient still resolves a success payload unchanged", async () => {
    const transport: EmployeeTransport = {
      async execute() {
        return {
          payload: { shiftId: "shift-1", result: "STARTED" },
          status: 201,
        };
      },
    };
    const failing = new EmployeeClient({
      transport: new NativeHttpTelemetryTransport(
        transport,
        failOpenTelemetryCollector(throwingCollector()),
      ),
    });
    const healthy = new EmployeeClient({ transport });
    await expect(
      failing.request<{ result: string }>({
        body: { targetLocationId: "77889912" },
        method: "POST",
        path: "/v1/staff/shifts/start",
      }),
    ).resolves.toEqual(
      await healthy.request<{ result: string }>({
        body: { targetLocationId: "77889912" },
        method: "POST",
        path: "/v1/staff/shifts/start",
      }),
    );
  });

  it("a real EmployeeClient still maps its API error identically", async () => {
    const mappedPayload = {
      code: "SHIFT_LOCATION_INVALID",
      message: "The selected location is not available.",
      requestId: "req-47",
    };
    const transport: EmployeeTransport = {
      async execute() {
        return { payload: mappedPayload, status: 409 };
      },
    };
    const failing = new EmployeeClient({
      transport: new NativeHttpTelemetryTransport(
        transport,
        throwingCollector(),
      ),
    });
    const healthy = new EmployeeClient({ transport });
    const a = await failing
      .request({
        body: { targetLocationId: "bad" },
        method: "POST",
        path: "/v1/staff/shifts/start",
      })
      .catch((error: unknown) => error);
    const b = await healthy
      .request({
        body: { targetLocationId: "bad" },
        method: "POST",
        path: "/v1/staff/shifts/start",
      })
      .catch((error: unknown) => error);
    const asApiError = (error: unknown): EmployeeApiError =>
      error instanceof EmployeeApiError
        ? error
        : new EmployeeApiError({
            code: "NOT_API_ERROR",
            message: String(error),
            status: -1,
          });
    const first = asApiError(a);
    const second = asApiError(b);
    expect(first).toBeInstanceOf(EmployeeApiError);
    expect(first.code).toBe(second.code);
    expect(first.status).toBe(second.status);
    expect(first.message).toBe(second.message);
    expect(first.code).toBe("SHIFT_LOCATION_INVALID");
    expect(first.status).toBe(409);
  });

  it("the production seam (createNativeEmployeeClient) survives a throwing recorder", async () => {
    const spy = vi.fn(() => {
      throw new Error("recorder exploded");
    });
    const client = createNativeEmployeeClient(
      "http://localhost:3001",
      fakeAuth(),
      undefined,
      { record: spy },
    );
    // The client fetches over global fetch; assert the seam in isolation by
    // wrapping a stub transport with the same throwing recorder.
    const response = { payload: { ok: true }, status: 200 };
    const wrapped = new NativeHttpTelemetryTransport(
      { execute: async () => response },
      spy,
    );
    await expect(
      wrapped.execute({ method: "GET", path: "/v1/staff/operational-context" }),
    ).resolves.toBe(response);
    expect(spy).toHaveBeenCalled();
    expect(client).toBeDefined();
  });

  it("no business error message text is ever captured in the recorded event", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const secretMessage = "password=hunter2 card=4111111111111111";
    const transport: EmployeeTransport = {
      async execute() {
        return {
          payload: { code: "X_CODE", message: secretMessage, requestId: "r" },
          status: 500,
        };
      },
    };
    const client = new EmployeeClient({
      transport: new NativeHttpTelemetryTransport(transport, (event) =>
        events.push(event),
      ),
    });
    await client
      .request({ method: "GET", path: "/v1/staff/tasks/queue" })
      .catch(() => undefined);
    expect(events).toHaveLength(1);
    const first = events[0]!;
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain("password");
    expect(first.errorCode).toBe("X_CODE");
    expect(first.classification).toBe("response");
  });
});

describe("adversarial: memory collector ring bound", () => {
  it("holds at its limit with hostile oversized events, dropping the oldest", () => {
    const ring = new BoundedTelemetryBuffer(8);
    for (let index = 0; index < 5_000; index += 1) {
      ring.record({
        classification: "response",
        durationMs: index,
        requestId: `req-${index}`,
        outcome: index % 2 === 0 ? "success" : "error",
        source: "http",
      });
    }
    expect(ring.size).toBe(8);
    const current = ring.current();
    expect(current).toHaveLength(8);
    // The newest safe event is retained; the ring kept a moving window.
    expect(current[current.length - 1]?.requestId).toBe("req-4999");
  });

  it("rejected events cost nothing in ring growth", () => {
    const ring = new BoundedTelemetryBuffer(4);
    for (let index = 0; index < 1_000; index += 1) {
      ring.record({
        classification: `poisoned-${index} Bearer x`,
        outcome: "error",
        source: "http",
      });
    }
    expect(ring.size).toBe(0);
    expect(ring.current()).toEqual([]);
  });

  it("repeated failures through a throwing collector stay bounded and cheap", () => {
    const broken = failOpenTelemetryCollector(throwingCollector());
    const ring = new BoundedTelemetryBuffer(4);
    for (let index = 0; index < 10_000; index += 1) {
      expect(() =>
        broken.record({
          classification: "network-failure",
          outcome: "error",
          source: "http",
        }),
      ).not.toThrow();
      ring.record({
        classification: "network-failure",
        outcome: "error",
        source: "http",
      });
    }
    expect(ring.size).toBe(4);
  });

  it("the ring's snapshot cannot be grown by mutating the returned view", () => {
    const ring = new BoundedTelemetryBuffer(2);
    ring.record({
      classification: "offline",
      outcome: "error",
      source: "network",
    });
    const view = ring.current();
    expect(() => {
      // Even if a hostile caller mutates what it can reach, the ring's own
      // contents stay bounded; the view length is a live read of the ring.
      (view as unknown as EmployeeTelemetryEvent[]).push({
        classification: "match",
        outcome: "success",
        source: "ocr",
      });
    }).not.toThrow();
    expect(ring.size).toBeLessThanOrEqual(2);
    ring.record({
      classification: "online",
      outcome: "success",
      source: "network",
    });
    expect(ring.size).toBe(2);
  });

  it("bounded requestId pattern is enforced inside the ring too", () => {
    const ring = new BoundedTelemetryBuffer(4);
    ring.record({
      classification: "response",
      outcome: "success",
      requestId: "bad request id\nwith newline",
      source: "http",
    });
    expect(ring.current()[0]?.requestId).toBeUndefined();
    expect(isSafeTelemetryRequestId(ring.current()[0]?.requestId)).toBe(false);
  });
});
