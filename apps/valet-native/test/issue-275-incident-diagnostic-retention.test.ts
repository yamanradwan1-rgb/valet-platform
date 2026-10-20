import { afterEach, describe, expect, it } from "vitest";

import { recordNativeIncidentPreflight } from "../src/incident/native-incident-preflight";
import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} from "../src/telemetry/native-telemetry-owner";
import { nativeSupportDiagnosticsView } from "../src/telemetry/native-support-diagnostics";

const provenance = {
  appBuild: "1",
  appVersion: "1.0.0",
  platform: "android",
} as const;

function setup() {
  const ring = new BoundedTelemetryBuffer();
  installNativeTelemetry(new NativeTelemetryOwner(ring, provenance));
  return ring;
}

function floodTaskQueue(count = 275) {
  for (let index = 0; index < count; index += 1) {
    getNativeTelemetry().record({
      classification: "response",
      operation: "task-queue",
      outcome: "success",
      source: "http",
    });
  }
}

afterEach(resetNativeTelemetryRegistryForTests);

describe("Issue #275 privacy-safe incident failure retention", () => {
  it("keeps the exact failed preflight stage visible after generic 200-ring eviction", () => {
    const ring = setup();
    recordNativeIncidentPreflight({ stage: "secure-uuid", outcome: "error" });
    floodTaskQueue();

    expect(ring.size).toBe(200);
    expect(ring.current().some((entry) => entry.operation === "incident-recovery"))
      .toBe(false);
    const snapshot = getNativeTelemetry().snapshot();
    expect(snapshot.latestIncidentFailureStage).toBe("secure-uuid");
    const view = nativeSupportDiagnosticsView(snapshot, 10);
    expect(view.eventRows).toHaveLength(10);
    expect(view.eventCount).toBe(200);
    expect(view.pinnedSections[0]).toMatchObject({
      firstFailedStage: "secure-uuid",
      classification: "incident-mutation-not-attempted",
      status: "failed",
    });
    expect(view.eventRows.every((line) => line.includes("task-queue")))
      .toBe(true);
    expect(nativeSupportDiagnosticsView(snapshot, 0).eventRows).toEqual([]);
  });

  it("preserves dispatched/unknown reservation and report outcomes without claiming rollback", () => {
    setup();
    recordNativeIncidentPreflight({ stage: "reserve-transport", outcome: "error" });
    floodTaskQueue();
    expect(nativeSupportDiagnosticsView(getNativeTelemetry().snapshot(), 10)
      .pinnedSections[0]?.classification).toBe("reservation-attempted-outcome-unknown");

    // A second explicit submit begins at context.success; the first
    // attempt has aborted and is never automatically replayed.
    recordNativeIncidentPreflight({ stage: "context", outcome: "success" });
    recordNativeIncidentPreflight({ stage: "report-transport", outcome: "error" });
    floodTaskQueue();
    expect(nativeSupportDiagnosticsView(getNativeTelemetry().snapshot(), 10)
      .pinnedSections[0]?.classification).toBe("incident-post-attempted-outcome-unknown");
  });

  it("does not retain attacker-supplied codes or business fields", () => {
    setup();
    getNativeTelemetry().record({
      classification: "preflight",
      errorCode: "privateplatecustomer.error",
      operation: "incident-recovery",
      outcome: "error",
      source: "recovery",
    });
    floodTaskQueue();
    const snapshot = getNativeTelemetry().snapshot();
    expect(snapshot.latestIncidentFailureStage).toBeUndefined();
    expect(JSON.stringify(nativeSupportDiagnosticsView(snapshot, 10)))
      .not.toContain("privateplatecustomer");
    // Even a forged snapshot cannot bypass the view's fixed-stage allowlist.
    const forged = {
      ...snapshot,
      latestIncidentFailureStage: "privateplatecustomer",
    } as never;
    expect(JSON.stringify(nativeSupportDiagnosticsView(forged, 10)))
      .not.toContain("privateplatecustomer");
  });

  it("drops an old failure on canonical report-response success", () => {
    setup();
    recordNativeIncidentPreflight({ stage: "storage-write", outcome: "error" });
    expect(getNativeTelemetry().snapshot().latestIncidentFailureStage).toBe("storage-write");
    recordNativeIncidentPreflight({ stage: "report-response", outcome: "success" });
    floodTaskQueue();
    expect(getNativeTelemetry().snapshot().latestIncidentFailureStage).toBeUndefined();
    expect(nativeSupportDiagnosticsView(getNativeTelemetry().snapshot(), 10).eventRows)
      .toHaveLength(10);
  });

  it("retains the first failing stage per submit and replaces it on a retry", () => {
    setup();
    recordNativeIncidentPreflight({ stage: "context", outcome: "success" });
    recordNativeIncidentPreflight({ stage: "storage-read", outcome: "error" });
    recordNativeIncidentPreflight({ stage: "marker-parse", outcome: "error" });
    expect(getNativeTelemetry().snapshot().latestIncidentFailureStage).toBe("storage-read");

    // The next tapped submit records context.success before validation.
    recordNativeIncidentPreflight({ stage: "context", outcome: "success" });
    recordNativeIncidentPreflight({ stage: "reserve-transport", outcome: "error" });
    floodTaskQueue();
    expect(getNativeTelemetry().snapshot().latestIncidentFailureStage).toBe("reserve-transport");
    expect(nativeSupportDiagnosticsView(getNativeTelemetry().snapshot(), 10)
      .pinnedSections[0]?.classification).toBe("reservation-attempted-outcome-unknown");
  });
});
