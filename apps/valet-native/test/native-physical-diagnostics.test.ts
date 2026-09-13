import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("keeps bootstrap and memory collection alive when persistence initialization fails", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.resetModules();
    const { installNativePhysicalDiagnosticsPersistence } =
      await import("../src/diagnostics/native-physical-diagnostics-persistence");
    const { getPhysicalDiagnostics } =
      await import("../src/diagnostics/native-physical-diagnostics");

    await expect(
      installNativePhysicalDiagnosticsPersistence(async () => {
        throw new Error("filesystem unavailable");
      }),
    ).resolves.toBeUndefined();

    const owner = getPhysicalDiagnostics();
    owner.record({
      metric: "task_list_ready_ms",
      startedAt: 100,
      endedAt: 125,
      outcome: "success",
      warmColdClass: "warm",
    });
    await owner.whenIdle();
    expect(owner.snapshot()).toMatchObject([
      { durationMs: 25, metric: "task_list_ready_ms", outcome: "success" },
    ]);
  });

  it("falls back safely when persistence read fails", async () => {
    const owner = new NativePhysicalDiagnosticsStore({
      clear: async () => undefined,
      read: async () => {
        throw new Error("read failed");
      },
      write: async () => undefined,
    });

    await expect(owner.load()).resolves.toBeUndefined();
    owner.record({
      metric: "task_list_ready_ms",
      startedAt: 100,
      endedAt: 130,
      outcome: "success",
      warmColdClass: "warm",
    });
    await owner.whenIdle();
    expect(owner.snapshot()).toMatchObject([
      { durationMs: 30, metric: "task_list_ready_ms", outcome: "success" },
    ]);
  });

  it("keeps collected memory evidence when persistence write fails", async () => {
    const owner = new NativePhysicalDiagnosticsStore({
      clear: async () => undefined,
      read: async () => null,
      write: async () => {
        throw new Error("write failed");
      },
    });

    await owner.load();
    owner.record({
      metric: "task_list_ready_ms",
      startedAt: 100,
      endedAt: 135,
      outcome: "success",
      warmColdClass: "warm",
    });
    await expect(owner.whenIdle()).resolves.toBeUndefined();
    expect(owner.snapshot()).toMatchObject([
      { durationMs: 35, metric: "task_list_ready_ms", outcome: "success" },
    ]);
  });

  it("clears memory evidence when persistence delete fails", async () => {
    const owner = new NativePhysicalDiagnosticsStore({
      clear: async () => {
        throw new Error("delete failed");
      },
      read: async () => null,
      write: async () => undefined,
    });

    await owner.load();
    owner.record({
      metric: "task_list_ready_ms",
      startedAt: 100,
      endedAt: 140,
      outcome: "success",
      warmColdClass: "warm",
    });
    await owner.whenIdle();
    await expect(owner.clear()).resolves.toBeUndefined();
    expect(owner.snapshot()).toEqual([]);
  });
});
