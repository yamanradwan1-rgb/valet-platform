/**
 * Native telemetry PRIVACY CANARY (MOB-024A).
 *
 * These tests are adversarial: they construct requests carrying secrets,
 * plate text, entity IDs and file URIs, run them through every telemetry
 * surface, then assert that NONE of that material can appear in any
 * recorded event. If any assertion here fails, a privacy leak exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  employeeNetworkError,
  type EmployeeTelemetryEvent,
  type NativeAuthSession,
} from "@valet/employee-client";

const mocks = vi.hoisted(() => ({
  appBuild: "321",
  appVersion: "2.1.0",
  platform: "android",
  exists: new Map<string, boolean>(),
  sizes: new Map<string, number>(),
  recognize: vi.fn(),
}));

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return mocks.appVersion;
  },
  get nativeBuildVersion() {
    return mocks.appBuild;
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
}));

const { getNativeTelemetry, resetNativeTelemetryRegistryForTests } =
  await import("../src/telemetry/native-telemetry-owner");
const { createNativeTelemetry } =
  await import("../src/telemetry/native-telemetry-provenance");
const { NativeHttpTelemetryTransport } =
  await import("../src/telemetry/native-http-telemetry");
const { createNativeEmployeeClient } =
  await import("../src/tasks/native-operational-http");

const accessToken = `vsa1.${"s".repeat(43)}`;
const SECRET_TOKEN = "Bearer SECRET-TOKEN";
const PLATE_TEXT = "plate-text";
const PICKUP_CODE = "pickup-1234";

const FORBIDDEN = [
  SECRET_TOKEN,
  PLATE_TEXT,
  PICKUP_CODE,
  "77889912",
  "entity-777",
  "file://camera/plate.jpg",
];

const sessionId = "44444444-4444-4444-8444-444444444444";

function auth(): NativeAuthSession {
  return {
    current: vi.fn(() => ({ authGeneration: 1, phase: "authenticated" })),
    getAccessToken: vi.fn(() => accessToken),
    handleDefinitiveAuthorizationLoss: vi.fn(async () => undefined),
    refresh: vi.fn(async () => "refreshed" as const),
  } as unknown as NativeAuthSession;
}

function recordedEvents(): EmployeeTelemetryEvent[] {
  return [...getNativeTelemetry().snapshot().events];
}

function assertNoSecrets(events: readonly EmployeeTelemetryEvent[]): void {
  const dump = JSON.stringify(events);
  for (const secret of FORBIDDEN) {
    expect(dump).not.toContain(secret);
  }
  expect(events).not.toContain(null);
  expect(events).not.toContain(undefined);
}

beforeEach(() => {
  // Re-stubbed each test: afterEach unstubs globals (origin validation
  // reads __DEV__ at call time, not import time).
  vi.stubGlobal("__DEV__", true);
  resetNativeTelemetryRegistryForTests();
  createNativeTelemetry();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetNativeTelemetryRegistryForTests();
});

describe("Native telemetry privacy canary", () => {
  it("never leaks request bodies, headers, params, or paths via the telemetry transport", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const transport = new NativeHttpTelemetryTransport(
      {
        execute: async () => ({ payload: { ok: true }, status: 200 }),
      },
      (event) => events.push(event),
    );
    await transport.execute({
      body: {
        expectedVersion: 3,
        note: `${SECRET_TOKEN} ${PLATE_TEXT} ${PICKUP_CODE}`,
      },
      headers: {
        "X-Valet-Internal-Code": PICKUP_CODE,
        "X-Valet-Internal-Code2": SECRET_TOKEN,
      },
      method: "POST",
      params: { locationId: "77889912" },
      path: `/v1/staff/valet-sessions/${sessionId}/incidents`,
    });
    assertNoSecrets(events);
    expect(events).toEqual([
      expect.objectContaining({
        classification: "response",
        outcome: "success",
      }),
    ]);
  });

  it("never leaks secrets through the full client + telemetry pipeline", async () => {
    const client = createNativeEmployeeClient(
      "http://localhost:3001",
      auth(),
      undefined,
      { record: (event) => getNativeTelemetry().record(event) },
    );
    // Non-2xx responses throw EmployeeApiError through normalizeEmployeeApiError.
    await client
      .request({
        body: {
          expectedVersion: 3,
          code: PICKUP_CODE,
          plate: PLATE_TEXT,
        },
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/incidents`,
      })
      .catch(() => undefined);
    const events = recordedEvents();
    assertNoSecrets(events);
  });

  it("never leaks secrets on the network-failure path", async () => {
    const transport = new NativeHttpTelemetryTransport(
      {
        execute: async () => {
          throw employeeNetworkError();
        },
      },
      (event) => getNativeTelemetry().record(event),
    );
    await transport
      .execute({
        body: { plate: PLATE_TEXT, code: PICKUP_CODE },
        headers: { Authorization: SECRET_TOKEN },
        method: "POST",
        path: "/v1/staff/other/77889912",
      })
      .catch(() => undefined);
    const events = recordedEvents();
    assertNoSecrets(events);
    expect(events.some((event) => event.outcome === "error")).toBe(true);
  });

  it("keeps only enumerated keys in every event, whatever the sink", () => {
    const owner = getNativeTelemetry();
    // Attempt to smuggle extras through the event object itself.
    owner.record({
      classification: "match",
      outcome: "success",
      source: "ocr",
      ...({
        plate: PLATE_TEXT,
        body: { code: PICKUP_CODE },
        token: SECRET_TOKEN,
      } as Record<string, unknown>),
    });
    const events = recordedEvents();
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual([
        "classification",
        "outcome",
        "source",
      ]);
    }
    assertNoSecrets(events);
  });

  it("only accepts bounded request ids in the correlation slot", async () => {
    const events: EmployeeTelemetryEvent[] = [];
    const transport = new NativeHttpTelemetryTransport(
      {
        execute: async () => ({
          payload: 1,
          requestId: "req ok; DROP",
          status: 200,
        }),
      },
      (event) => events.push(event),
    );
    await transport.execute({ method: "GET", path: "/z" });
    // Header-injection-style ids are dropped, not stored raw.
    expect(events[0]).toEqual({
      classification: "response",
      durationMs: expect.any(Number),
      outcome: "success",
      source: "http",
    });
    assertNoSecrets(events);
  });
});

describe("Native telemetry privacy canary > registry state", () => {
  it("starts each test with a clean, empty memory ring", () => {
    expect(getNativeTelemetry().snapshot().events).toEqual([]);
    expect(getNativeTelemetry().snapshot().provenance).toEqual({
      appBuild: "321",
      appVersion: "2.1.0",
      platform: "android",
    });
  });
});
