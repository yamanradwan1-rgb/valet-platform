/**
 * DEC-077 business-shape preservation tests for the exactly-once recovery
 * telemetry repair (MOB-024A review fix #3).
 *
 * The telemetry repair must NOT change any business result: snapshot
 * phases, marker nulling, definitive-outcome clearResolved(), and return
 * shapes stay byte-for-byte identical to the pre-fix behavior. These
 * cases assert the returned shapes for FOUND and the definitive RETIRED
 * null-marker outcome, plus the full NativeIncidentSession restore flow.
 *
 * Exactly-once telemetry counts live in
 * native-incident-recovery-telemetry.test.ts.
 */
import {
  IncidentRecoveryState,
  type IncidentRecoveryTransport,
} from "@valet/employee-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyNativeIncidentRecoveryResolution,
  applyNativeIncidentRecoveryRestore,
} from "../src/incident/native-incident-recovery-resolution";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
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

describe("business shapes are unchanged by the exactly-once repair", () => {
  it("FOUND restore still returns the success snapshot with the marker kept", async () => {
    recoveryRing();
    const recovery = recoveryWith({ outcome: "FOUND", report: recoveryReport });
    const restored = await recovery.restore(recoveryContext);
    const applied = await applyNativeIncidentRecoveryRestore(
      recovery,
      restored,
      null,
    );
    // Found is NOT definitive: the marker is preserved verbatim.
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
  });

  it("direct RETIRED apply still nulls the marker and clears durable storage", async () => {
    const store = recoveryMemoryStore();
    const recovery = recoveryWith(
      {
        incidentId: recoveryIncidentId,
        outcome: "RETIRED",
        sessionId: recoverySessionId,
      },
      store,
    );
    const applied = await applyNativeIncidentRecoveryResolution(
      recovery,
      recoveryMarker,
      {
        incidentId: recoveryIncidentId,
        outcome: "RETIRED",
        sessionId: recoverySessionId,
      },
      false,
    );
    // Definitive outcome: marker nulled AND storage cleared (DEC-077).
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("recovery-retired");
    expect(applied.snapshot.deadlineReached).toBe(false);
    await expect(store.read()).resolves.toBeNull();
  });

  it("RESERVED direct apply keeps the marker for a later resolution", async () => {
    const recovery = recoveryWith({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId: recoveryIncidentId,
      outcome: "RESERVED",
      sessionId: recoverySessionId,
    });
    const applied = await applyNativeIncidentRecoveryResolution(
      recovery,
      recoveryMarker,
      {
        expiresAt: "2026-09-12T12:15:00.000Z",
        incidentId: recoveryIncidentId,
        outcome: "RESERVED",
        sessionId: recoverySessionId,
      },
      true,
    );
    expect(applied.marker).toEqual(recoveryMarker);
    expect(applied.snapshot).toMatchObject({
      deadlineReached: true,
      phase: "recovery-reserved",
    });
  });

  it("UNKNOWN direct apply is definitive: marker nulled, storage cleared", async () => {
    const store = recoveryMemoryStore();
    const recovery = recoveryWith(
      {
        incidentId: recoveryIncidentId,
        outcome: "UNKNOWN",
        sessionId: recoverySessionId,
      },
      store,
    );
    const applied = await applyNativeIncidentRecoveryResolution(
      recovery,
      recoveryMarker,
      {
        incidentId: recoveryIncidentId,
        outcome: "UNKNOWN",
        sessionId: recoverySessionId,
      },
      false,
    );
    expect(applied.marker).toBeNull();
    expect(applied.snapshot.phase).toBe("recovery-unknown");
    await expect(store.read()).resolves.toBeNull();
  });
});

describe("full session restore flow keeps exactly-one telemetry and shapes", () => {
  it("records exactly ONE event for a restored RETIRED marker via the session", async () => {
    const buffer = recoveryRing();
    const store = recoveryMemoryStore();
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(async () => ({
        incidentId: recoveryIncidentId,
        outcome: "RETIRED" as const,
        sessionId: recoverySessionId,
      })),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const session = new NativeIncidentSession(
      () => ({ request: vi.fn() }) as never,
      new IncidentRecoveryState(store, transport, undefined, () =>
        Date.parse("2026-09-12T12:00:00.000Z"),
      ),
    );
    await session.observeRecoveryContext(recoveryContext);
    expect(session.current().phase).toBe("recovery-retired");
    expect(buffer.current()).toEqual([
      { classification: "retired", outcome: "success", source: "recovery" },
    ]);
  });
});
