/**
 * Exactly-once incident recovery telemetry tests (MOB-024A review fix #3).
 *
 * One resolution must produce EXACTLY ONE "recovery" telemetry event. The
 * single record lives inside applyNativeIncidentRecoveryResolution — the
 * authoritative executor every resolution flows through — and the restore
 * wrapper no longer re-records it. Every wrapper-only outcome
 * (invalidated, storage-unavailable, apply-threw) still records exactly
 * its own single event.
 *
 * See native-incident-recovery-telemetry-shapes.test.ts for the DEC-077
 * business-shape preservation cases.
 */
import {
  type IncidentRecoveryResolution,
  type IncidentRecoveryRestore,
} from "@valet/employee-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyNativeIncidentRecoveryResolution,
  applyNativeIncidentRecoveryRestore,
} from "../src/incident/native-incident-recovery-resolution";
import { resetNativeTelemetryRegistryForTests } from "../src/telemetry/native-telemetry-owner";
import {
  recoveryContext,
  recoveryIncidentId,
  recoveryMarker,
  recoveryMemoryStore,
  recoveryReport,
  recoveryRing,
  recoverySessionId,
  recoveryWith,
} from "./native-incident-recovery-telemetry-fixture";

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("exactly-once recovery telemetry on restore", () => {
  it("records exactly ONE found event for a FOUND resolution", async () => {
    const buffer = recoveryRing();
    const recovery = recoveryWith({ outcome: "FOUND", report: recoveryReport });
    const restored = await recovery.restore(recoveryContext);
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      restored as IncidentRecoveryRestore,
      null,
    );
    expect(applied).toEqual({
      marker: recoveryMarker,
      snapshot: {
        deadlineReached: false,
        detail: null,
        error: null,
        phase: "success",
        report: recoveryReport,
        target: null,
      },
    });
    expect(buffer.current()).toEqual([
      { classification: "found", outcome: "success", source: "recovery" },
    ]);
  });

  it("records exactly ONE reserved event for a RESERVED resolution", async () => {
    const buffer = recoveryRing();
    const recovery = recoveryWith({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId: recoveryIncidentId,
      outcome: "RESERVED",
      sessionId: recoverySessionId,
    });
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toEqual(recoveryMarker);
    expect(applied.snapshot.phase).toBe("recovery-reserved");
    expect(buffer.current()).toEqual([
      { classification: "reserved", outcome: "success", source: "recovery" },
    ]);
  });

  it("records exactly ONE retired event and clears the marker for RETIRED", async () => {
    const buffer = recoveryRing();
    const store = recoveryMemoryStore();
    const recovery = recoveryWith(
      {
        incidentId: recoveryIncidentId,
        outcome: "RETIRED",
        sessionId: recoverySessionId,
      },
      store,
    );
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("recovery-retired");
    await expect(store.read()).resolves.toBeNull();
    expect(buffer.current()).toEqual([
      { classification: "retired", outcome: "success", source: "recovery" },
    ]);
  });

  it("records exactly ONE unknown event for an UNKNOWN resolution", async () => {
    const buffer = recoveryRing();
    const recovery = recoveryWith({
      incidentId: recoveryIncidentId,
      outcome: "UNKNOWN",
      sessionId: recoverySessionId,
    });
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("recovery-unknown");
    expect(buffer.current()).toEqual([
      { classification: "unknown", outcome: "unknown", source: "recovery" },
    ]);
  });

  it("records exactly ONE unavailable error event for an UNAVAILABLE resolution", async () => {
    const buffer = recoveryRing();
    const recovery = recoveryWith(
      { outcome: "UNAVAILABLE" },
      recoveryMemoryStore(recoveryMarker),
    );
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toEqual(recoveryMarker);
    expect(applied.snapshot.phase).toBe("recovery-unavailable");
    expect(buffer.current()).toEqual([
      { classification: "unavailable", outcome: "error", source: "recovery" },
    ]);
  });

  it("records exactly ONE unavailable event when local storage is unreadable", async () => {
    const buffer = recoveryRing();
    const broken = {
      async delete() {},
      async read() {
        throw new Error("unreadable");
      },
      async write() {},
    } as const;
    const recovery = recoveryWith({ outcome: "UNAVAILABLE" }, broken);
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      recoveryMarker,
    );
    expect(applied).toEqual({
      marker: recoveryMarker,
      snapshot: {
        deadlineReached: false,
        detail: null,
        error: null,
        phase: "recovery-unavailable",
        report: null,
        target: null,
      },
    });
    expect(buffer.current()).toEqual([
      { classification: "unavailable", outcome: "error", source: "recovery" },
    ]);
  });

  it("records exactly ONE invalidated event when the marker context no longer matches", async () => {
    const buffer = recoveryRing();
    const staleMarker = {
      ...recoveryMarker,
      locationId: "55555555-5555-4555-8555-555555555555",
    };
    const recovery = recoveryWith(
      { outcome: "UNAVAILABLE" },
      recoveryMemoryStore(staleMarker),
    );
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("recovery-invalidated");
    expect(buffer.current()).toEqual([
      { classification: "invalidated", outcome: "error", source: "recovery" },
    ]);
  });

  it("records exactly ONE unavailable event when applying throws (catch path)", async () => {
    const buffer = recoveryRing();
    const failing = {
      async delete() {
        throw new Error("delete failed");
      },
      async read() {
        return recoveryMarker;
      },
      async write() {},
    } as const;
    const recovery = recoveryWith(
      {
        incidentId: recoveryIncidentId,
        outcome: "RETIRED",
        sessionId: recoverySessionId,
      },
      failing,
    );
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied).toEqual({
      marker: recoveryMarker,
      snapshot: {
        deadlineReached: false,
        detail: null,
        error: null,
        phase: "recovery-unavailable",
        report: null,
        target: null,
      },
    });
    expect(buffer.current()).toEqual([
      { classification: "unavailable", outcome: "error", source: "recovery" },
    ]);
  });

  it("records NOTHING for an empty restore", async () => {
    const buffer = recoveryRing();
    const recovery = recoveryWith(
      { outcome: "UNAVAILABLE" },
      recoveryMemoryStore(null),
    );
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      await recovery.restore(recoveryContext),
      null,
    );
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("inactive");
    expect(buffer.current()).toEqual([]);
  });
});

describe("exactly-once recovery telemetry on direct resolution apply", () => {
  it("records exactly ONE event with no hidden second from any wrapper", async () => {
    const buffer = recoveryRing();
    const resolution: IncidentRecoveryResolution = {
      outcome: "FOUND",
      report: recoveryReport,
    };
    const recovery = recoveryWith(resolution);
    const applied = await applyNativeIncidentRecoveryResolution(
      recovery,
      recoveryMarker,
      resolution,
      true,
    );
    expect(applied.marker).toEqual(recoveryMarker);
    expect(applied.snapshot).toMatchObject({
      deadlineReached: true,
      phase: "success",
      report: recoveryReport,
    });
    expect(buffer.current()).toEqual([
      { classification: "found", outcome: "success", source: "recovery" },
    ]);
  });
});
