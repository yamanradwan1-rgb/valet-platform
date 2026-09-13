import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeTelemetryCollector,
  EmployeeTelemetryEvent,
  EmployeeTelemetryProvenance,
} from "@valet/employee-client";

const mocks = vi.hoisted(() => ({
  appBuild: undefined as string | undefined,
  appVersion: undefined as string | undefined,
  platform: "android",
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

const provenanceModule =
  await import("../src/telemetry/native-telemetry-provenance");
const ownerModule = await import("../src/telemetry/native-telemetry-owner");
const {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  createBoundedMemoryCollector,
  getNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} = ownerModule;
const { resolveNativeTelemetryProvenance } = provenanceModule;

function event(classification: string, source: string, outcome: string) {
  return {
    classification,
    outcome,
    source,
  } as EmployeeTelemetryEvent;
}

function harness(collector?: EmployeeTelemetryCollector) {
  const events: EmployeeTelemetryEvent[] = [];
  const sink: EmployeeTelemetryCollector = {
    record: (value) => events.push(value),
  };
  // The buffer IS the default sink: snapshot() reads it (support display).
  const buffer =
    collector instanceof BoundedTelemetryBuffer ? collector : undefined;
  const provenance: EmployeeTelemetryProvenance = {
    appBuild: "101",
    appVersion: "1.4.0",
    platform: "android",
  };
  const owner = new NativeTelemetryOwner(
    buffer ?? collector ?? sink,
    provenance,
  );
  return { buffer, events, owner, provenance, sink } as const;
}

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
  mocks.appBuild = undefined;
  mocks.appVersion = undefined;
  mocks.platform = "android";
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("Native telemetry bounded ring buffer", () => {
  it("caps at 200 events and drops the oldest", () => {
    const buffer = new BoundedTelemetryBuffer();
    for (let index = 0; index < 250; index += 1) {
      buffer.record(
        event(index % 2 === 0 ? "match" : "no-match", "ocr", "success"),
      );
    }
    expect(buffer.size).toBe(200);
    const current = buffer.current();
    expect(current).toHaveLength(200);
    // 250 recordings, cap 200: the first 50 were dropped; the oldest
    // retained is index 50 (even -> "match") and the newest index 249
    // (odd -> "no-match").
    expect(current[0]).toEqual({
      classification: "match",
      outcome: "success",
      source: "ocr",
    });
    expect(current[current.length - 1]).toEqual({
      classification: "no-match",
      outcome: "success",
      source: "ocr",
    });
    // Sequence is preserved (not re-ordered) inside the ring.
    expect(current[1]?.classification).toBe("no-match");
    expect(current[2]?.classification).toBe("match");
  });

  it("rejects classifications outside the closed vocabulary", () => {
    const buffer = new BoundedTelemetryBuffer();
    buffer.record(event("match", "ocr", "success"));
    buffer.record(event("free-business-string", "ocr", "success"));
    buffer.record(event("match", "not-a-source", "success"));
    buffer.record(event("plate-123", "ocr", "success"));
    expect(buffer.size).toBe(1);
    expect(buffer.current()[0]?.classification).toBe("match");
  });

  it("returns a frozen-adjacent readonly view without aliasing growth", () => {
    const buffer = createBoundedMemoryCollector(3);
    buffer.record(event("match", "ocr", "success"));
    const view = buffer.current();
    expect(view).toHaveLength(1);
    buffer.record(event("no-match", "ocr", "success"));
    expect(buffer.current()).toHaveLength(2);
    expect(view).toHaveLength(1);
  });
});

describe("Native telemetry owner fail-open guarantees", () => {
  it("swallows collector throws so record() never breaks the caller", () => {
    const throwing: EmployeeTelemetryCollector = {
      record: () => {
        throw new Error("collector exploded");
      },
    };
    const fragile = new NativeTelemetryOwner(throwing, harness().provenance);
    expect(() =>
      fragile.record(event("match", "ocr", "success")),
    ).not.toThrow();
    const run = harness();
    expect(() =>
      run.owner.record(event("match", "ocr", "success")),
    ).not.toThrow();
    expect(run.events).toHaveLength(1);
  });

  it("attaches provenance on the snapshot, not per event", () => {
    // snapshot() is the support-display view: it reads the memory ring, so
    // the harness wires a buffer (the design: the buffer IS the sink).
    const buffer = createBoundedMemoryCollector();
    const owner = new NativeTelemetryOwner(buffer, harness().provenance);
    owner.record(event("match", "ocr", "success"));
    const snapshot = owner.snapshot();
    expect(snapshot.provenance).toEqual(harness().provenance);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toBeDefined();
    expect(Object.keys(snapshot.events[0] ?? {}).sort()).toEqual([
      "classification",
      "outcome",
      "source",
    ]);
  });

  it("correlates via withRequestId only for bounded request ids", () => {
    const run = harness();
    const record = run.owner.withRequestId("req_abc-123");
    record(event("response", "http", "success"));
    record(event("network-failure", "http", "error"));
    // An unsafe id is dropped entirely — the raw value never reaches an event.
    const bad = run.owner.withRequestId("bad request id\nwith newline");
    bad(event("response", "http", "success"));
    expect(run.events).toEqual([
      {
        classification: "response",
        outcome: "success",
        requestId: "req_abc-123",
        source: "http",
      },
      {
        classification: "network-failure",
        outcome: "error",
        requestId: "req_abc-123",
        source: "http",
      },
      { classification: "response", outcome: "success", source: "http" },
    ]);
  });
});

describe("Native telemetry provenance", () => {
  it("falls back to unknown strings when Application metadata is missing", () => {
    expect(resolveNativeTelemetryProvenance()).toEqual({
      appBuild: "unknown",
      appVersion: "unknown",
      platform: "android",
    });
  });

  it("reads bounded metadata when present", () => {
    mocks.appBuild = "321";
    mocks.appVersion = "2.1.0";
    const provenance = resolveNativeTelemetryProvenance();
    expect(provenance).toEqual({
      appBuild: "321",
      appVersion: "2.1.0",
      platform: "android",
    });
  });

  it("normalizes the platform to lowercase and rejects garbage", () => {
    mocks.platform = "iOS";
    expect(resolveNativeTelemetryProvenance().platform).toBe("ios");
    mocks.platform = "weird os!";
    expect(resolveNativeTelemetryProvenance().platform).toBe("unknown");
  });

  it("drops blank/oversized/unsafe build strings", () => {
    mocks.appBuild = "   ";
    mocks.appVersion = "x".repeat(200);
    const provenance = resolveNativeTelemetryProvenance();
    expect(provenance.appBuild).toBe("unknown");
    expect(provenance.appVersion).toBe("unknown");
  });

  it("wires createNativeTelemetry into the module registry", () => {
    // Pre-wiring: the default no-op owner has unknown provenance.
    expect(getNativeTelemetry().snapshot().provenance.platform).toBe("unknown");
    const wiring = provenanceModule.createNativeTelemetry();
    expect(getNativeTelemetry()).toBe(wiring.owner);
    getNativeTelemetry().record(event("foreground", "lifecycle", "success"));
    expect(wiring.collector.current()).toHaveLength(1);
    expect(wiring.owner.snapshot().provenance.platform).toBe("android");
  });
});
