import { describe, expect, it } from "vitest";

import {
  createPhysicalEvidence,
  parsePhysicalSamples,
  summarizePhysicalSamples,
  type PhysicalSample,
} from "../src/diagnostics/native-physical-diagnostics-model";
import {
  NativePhysicalDiagnosticsStore,
  type PhysicalDiagnosticsPersistence,
} from "../src/diagnostics/native-physical-diagnostics-store";

function sample(
  durationMs: number,
  outcome: "success" | "failure" = "success",
): PhysicalSample {
  return {
    metric: "task_list_ready_ms",
    durationMs,
    outcome,
    warmColdClass: "warm",
    timestamp: "2026-09-13T00:00:00.000Z",
    ...(outcome === "failure" ? { failureClass: "network" as const } : {}),
  };
}

function memoryPersistence(
  initial: string | null = null,
): PhysicalDiagnosticsPersistence & { value: string | null } {
  return {
    value: initial,
    async clear() {
      this.value = null;
    },
    async read() {
      return this.value;
    },
    async write(value) {
      this.value = value;
    },
  };
}

describe("physical diagnostics evidence", () => {
  it("uses auditable nearest-rank p50/p95/p99 summaries", () => {
    const samples = Array.from({ length: 100 }, (_, index) =>
      sample(index + 1),
    );
    expect(summarizePhysicalSamples(samples)).toEqual({
      samples: 100,
      minimumMs: 1,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
      maximumMs: 100,
      successes: 100,
      failures: 0,
    });
  });

  it("counts bounded failure samples without raw error data", () => {
    const summary = summarizePhysicalSamples([
      sample(12),
      sample(20, "failure"),
    ]);
    expect(summary).toMatchObject({ samples: 2, successes: 1, failures: 1 });
    expect(
      JSON.stringify(createPhysicalEvidence([sample(20, "failure")])),
    ).not.toMatch(
      /taskId|sessionId|plate|token|headers|url|customer|membershipId|locationId/i,
    );
  });

  it("rejects extra fields at the persistence sanitization boundary", () => {
    const unsafe = { ...sample(10), taskId: "sensitive", error: "raw payload" };
    expect(parsePhysicalSamples(JSON.stringify([unsafe]))).toEqual([]);
    expect(
      parsePhysicalSamples(
        JSON.stringify([{ ...sample(10), warmColdClass: "task-123" }]),
      ),
    ).toEqual([]);
  });

  it("rejects an invalid live classification before memory, persistence, or export", async () => {
    const persistence = memoryPersistence();
    const owner = new NativePhysicalDiagnosticsStore(persistence);
    await owner.load();
    owner.record({
      metric: "task_list_ready_ms",
      startedAt: 100,
      endedAt: 120,
      outcome: "success",
      warmColdClass: "task-123-sensitive",
    } as unknown as Parameters<NativePhysicalDiagnosticsStore["record"]>[0]);
    await owner.whenIdle();
    expect(owner.snapshot()).toEqual([]);
    expect(persistence.value).toBeNull();
    expect(JSON.stringify(owner.evidence())).not.toContain(
      "task-123-sensitive",
    );
  });

  it("persists, restores, and clears only diagnostics samples", async () => {
    const persistence = memoryPersistence();
    const owner = new NativePhysicalDiagnosticsStore(persistence);
    await owner.load();
    owner.record({
      metric: "camera_ready_ms",
      startedAt: 100,
      endedAt: 145,
      outcome: "success",
      warmColdClass: "first",
    });
    await owner.whenIdle();
    const restored = new NativePhysicalDiagnosticsStore(persistence);
    await restored.load();
    expect(restored.snapshot()).toHaveLength(1);
    await restored.clear();
    expect(restored.snapshot()).toEqual([]);
    expect(persistence.value).toBeNull();
  });
});
