/**
 * Native telemetry SURFACE wiring tests (MOB-024A).
 *
 * Covers the surfaces that record production events: the HTTP transport
 * wrapper (with its closed operation correlation), the OCR mapping, and
 * the auth/lifecycle/network/push/recovery classification emission points
 * wired in this task.
 *
 * The exhaustive route-table mapper matrix and the auth X-Request-Id
 * correlation suite live in native-telemetry-operation.test.ts (split for
 * the 300-line authored-file ceiling in docs/17).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  employeeNetworkError,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryProvenance,
} from "@valet/employee-client";

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return "2.1.0";
  },
  get nativeBuildVersion() {
    return "321";
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return "android";
    },
  },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
}));

const ownerModule = await import("../src/telemetry/native-telemetry-owner");
const httpTelemetryModule =
  await import("../src/telemetry/native-http-telemetry");
const ocrTelemetryModule =
  await import("../src/check-in/native-plate-ocr-telemetry");

const {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} = ownerModule;
const { NativeHttpTelemetryTransport } = httpTelemetryModule;
const { recordNativePlateOcrTelemetry } = ocrTelemetryModule;

const provenance: EmployeeTelemetryProvenance = {
  appBuild: "101",
  appVersion: "1.4.0",
  platform: "android",
};

function wiredBuffer() {
  const buffer = new BoundedTelemetryBuffer();
  installNativeTelemetry(new NativeTelemetryOwner(buffer, provenance));
  return buffer;
}

function recorded(): EmployeeTelemetryEvent[] {
  return [...getNativeTelemetry().snapshot().events];
}

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("Native HTTP telemetry transport", () => {
  function transport(
    record: (value: EmployeeTelemetryEvent) => void,
    behavior: (request: {
      method: string;
      path: string;
    }) => Promise<{ payload: unknown; requestId?: string; status: number }>,
  ) {
    return new NativeHttpTelemetryTransport(
      { execute: (request) => behavior(request) },
      record,
    );
  }

  it("records one success event with the response header requestId", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const t = transport(
      (value) => events.push(value),
      async () => ({ payload: { ok: true }, requestId: "req-1", status: 200 }),
    );
    await expect(
      t.execute({ method: "GET", path: "/v1/staff/tasks/queue" }),
    ).resolves.toEqual({
      payload: { ok: true },
      requestId: "req-1",
      status: 200,
    });
    expect(events).toEqual([
      {
        classification: "response",
        durationMs: expect.any(Number),
        operation: "task-queue",
        outcome: "success",
        requestId: "req-1",
        source: "http",
      },
    ]);
  });

  it("classifies network errors and rethrows the original unchanged", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const original = employeeNetworkError();
    const t = transport(
      (value) => events.push(value),
      async () => {
        throw original;
      },
    );
    const caught = await t
      .execute({ method: "GET", path: "/v1/staff/operational-context" })
      .catch((error) => error);
    expect(caught).toBe(original);
    expect(events).toEqual([
      {
        classification: "network-failure",
        durationMs: expect.any(Number),
        errorCode: "NETWORK_ERROR",
        operation: "operational-context",
        outcome: "error",
        source: "http",
      },
    ]);
  });

  it("classifies 401 as auth-loss with the machine error code", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const { employeeAuthenticationRequiredError } =
      await import("@valet/employee-client");
    const original = employeeAuthenticationRequiredError();
    const t = transport(
      (value) => events.push(value),
      async () => {
        throw original;
      },
    );
    await t
      .execute({ method: "POST", path: "/v1/staff/tasks/666/assign" })
      .catch(() => undefined);
    expect(events).toEqual([
      {
        classification: "auth-loss",
        durationMs: expect.any(Number),
        errorCode: "STAFF_AUTHENTICATION_REQUIRED",
        operation: "task-assign",
        outcome: "error",
        source: "http",
      },
    ]);
  });

  it("records outcome unknown for a non-Error rejection and rethrows it", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const t = transport(
      (value) => events.push(value),
      async () => {
        throw "just a string";
      },
    );
    await expect(t.execute({ method: "GET", path: "/x" })).rejects.toBe(
      "just a string",
    );
    expect(events).toEqual([
      {
        classification: "network-failure",
        durationMs: expect.any(Number),
        operation: "other",
        outcome: "unknown",
        source: "http",
      },
    ]);
  });

  it("attributes a network failure with no requestId to the safe operation", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const uuid = "66666666-6666-6666-8666-666666666666";
    const t = transport(
      (value) => events.push(value),
      async () => {
        throw employeeNetworkError();
      },
    );
    await t
      .execute({
        method: "POST",
        path: `/v1/staff/valet-sessions/${uuid}/start-parking`,
      })
      .catch(() => undefined);
    expect(events).toEqual([
      {
        classification: "network-failure",
        durationMs: expect.any(Number),
        errorCode: "NETWORK_ERROR",
        operation: "parking-start",
        outcome: "error",
        source: "http",
      },
    ]);
    expect("requestId" in (events[0] ?? {})).toBe(false);
    expect(JSON.stringify(events)).not.toContain(uuid);
  });

  it("survives a throwing telemetry sink without breaking the response", async () => {
    const t = transport(
      () => {
        throw new Error("sink broken");
      },
      async () => ({ payload: 1, status: 200 }),
    );
    await expect(t.execute({ method: "GET", path: "/y" })).resolves.toEqual({
      payload: 1,
      status: 200,
    });
  });
});

describe("Native OCR telemetry mapping", () => {
  it("maps provider statuses onto the closed vocabulary", () => {
    wiredBuffer();
    recordNativePlateOcrTelemetry("MATCH");
    recordNativePlateOcrTelemetry("NO_MATCH");
    recordNativePlateOcrTelemetry("UNAVAILABLE");
    recordNativePlateOcrTelemetry("aborted");
    recordNativePlateOcrTelemetry("capture-unavailable");
    recordNativePlateOcrTelemetry("capture-unavailable", "PREVIEW_CHANGED");
    expect(recorded()).toEqual([
      { classification: "match", outcome: "success", source: "ocr" },
      { classification: "no-match", outcome: "success", source: "ocr" },
      {
        classification: "provider-unavailable",
        outcome: "error",
        source: "ocr",
      },
      { classification: "aborted", outcome: "error", source: "ocr" },
      {
        classification: "capture-unavailable",
        outcome: "error",
        source: "ocr",
      },
      {
        classification: "capture-unavailable",
        errorCode: "OCR_CAPTURE_METADATA_PREVIEW_CHANGED",
        outcome: "error",
        source: "ocr",
      },
    ]);
  });

  it("emits nothing when the registry is unwired (fail-open)", () => {
    expect(() => recordNativePlateOcrTelemetry("UNAVAILABLE")).not.toThrow();
    expect(recorded()).toEqual([]);
  });
});

describe("Native telemetry registry default", () => {
  it("is a no-op before bootstrap wiring", () => {
    expect(() =>
      getNativeTelemetry().record({
        classification: "foreground",
        outcome: "success",
        source: "lifecycle",
      }),
    ).not.toThrow();
    expect(recorded()).toEqual([]);
  });
});
