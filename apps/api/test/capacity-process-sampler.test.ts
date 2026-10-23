import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createCapacityProcessSampler,
  parseLinuxProcessSample,
  parseWindowsProcessSample,
  requireCapacityApiPid,
  type ProcessMetricSample,
  type ProcessMetricSampler,
} from "../tools/capacity/capacity-process-sampler";
import {
  CapacitySafetyMonitor,
  SAFETY_LIMITS,
} from "../tools/capacity/capacity-safety";

function metric(
  processCpuUnits: number,
  oneCpuCapacityUnits: number,
  rssBytes = 1024,
  processIdentity = "test-process",
): ProcessMetricSample {
  return {
    oneCpuCapacityUnits,
    processCpuUnits,
    processIdentity,
    rssBytes,
  };
}

function sampler(
  samples: readonly ProcessMetricSample[],
): ProcessMetricSampler {
  let index = 0;
  return {
    async sample() {
      const value = samples[index];
      index += 1;
      if (value === undefined) throw new Error("No process sample available.");
      return value;
    },
  };
}

function healthyPool(active = 1, waiting = 0): Pool {
  return {
    query: async () => ({ rows: [{ active, waiting }] }),
  } as unknown as Pool;
}

describe("capacity process sampling", () => {
  it.skipIf(process.platform !== "win32")(
    "bounds and verifies the real Windows Get-Process reader",
    async () => {
      // This dedicated platform integration proves actual native sampling;
      // portable PID contract tests use a deterministic injected sampler so
      // slow PowerShell startup cannot make validation tests flaky.
      const sample = await createCapacityProcessSampler("win32").sample(process.pid);
      expect(sample.processIdentity).toMatch(/^windows:/);
      expect(sample.oneCpuCapacityUnits).toBeGreaterThan(0);
      expect(sample.rssBytes).toBeGreaterThan(0);
      await expect(requireCapacityApiPid("2147483647")).rejects.toThrow(
        "CAPACITY_API_PID does not identify a readable process.",
      );
    },
    25_000,
  );
  it("parses Linux /proc samples without assuming a space-free process name", () => {
    const statFields = [
      "R",
      ...Array.from({ length: 10 }, () => "0"),
      "10",
      "5",
      ...Array.from({ length: 5 }, () => "0"),
      "1",
      "42",
    ];
    expect(
      parseLinuxProcessSample(
        `123 (node worker) ${statFields.join(" ")}`,
        "cpu 100 0 50 850 0 0 0 0 0 0\n",
        "VmRSS:\t2048 kB\n",
        4,
      ),
    ).toEqual({
      oneCpuCapacityUnits: 250,
      processCpuUnits: 15,
      processIdentity: "linux:42",
      rssBytes: 2 * 1024 * 1024,
    });
    expect(() =>
      parseLinuxProcessSample("malformed", "cpu 1 2 3\n", "VmRSS: 1 kB\n", 1),
    ).toThrow("Linux process CPU sample is malformed.");
  });

  it("strictly parses Windows built-in process samples", () => {
    expect(
      parseWindowsProcessSample(
        JSON.stringify({
          cpuMs: 250.5,
          pid: 4321,
          rssBytes: 123456,
          sampleMs: 5000,
          startTimeUtc: "2026-09-19T00:00:00.0000000Z",
        }),
        4321,
      ),
    ).toEqual({
      oneCpuCapacityUnits: 5000,
      processCpuUnits: 250.5,
      processIdentity: "windows:2026-09-19T00:00:00.0000000Z",
      rssBytes: 123456,
    });
    expect(() => parseWindowsProcessSample("not-json", 4321)).toThrow(
      "not valid JSON",
    );
    expect(() => createCapacityProcessSampler("unsupported-os")).toThrow(
      "unsupported on platform",
    );
  });

  it("normalizes CPU to one logical CPU and preserves RSS bytes", async () => {
    const monitor = new CapacitySafetyMonitor(
      healthyPool(),
      123,
      sampler([metric(100, 1000, 123), metric(300, 1100, 456)]),
    );
    expect(await monitor.snapshot()).toMatchObject({
      apiCpuPercent: null,
      apiRssBytes: 123,
    });
    expect(await monitor.snapshot()).toMatchObject({
      apiCpuPercent: 200,
      apiRssBytes: 456,
    });
  });

  it("fails closed on sustained CPU, RSS, and process identity changes", async () => {
    const cpuSamples = [metric(0, 1000)];
    for (let index = 1; index <= SAFETY_LIMITS.apiCpuSamples; index += 1) {
      cpuSamples.push(metric(index * 95, 1000 + index * 100));
    }
    const cpu = new CapacitySafetyMonitor(
      healthyPool(),
      123,
      sampler(cpuSamples),
    );
    await cpu.snapshot();
    for (let index = 1; index < SAFETY_LIMITS.apiCpuSamples; index += 1) {
      await cpu.snapshot();
    }
    await expect(cpu.snapshot()).rejects.toThrow(
      "SAFETY_ABORT: sustained API CPU limit reached",
    );

    const rss = new CapacitySafetyMonitor(
      healthyPool(),
      123,
      sampler([metric(0, 1000, SAFETY_LIMITS.apiRssBytes)]),
    );
    await expect(rss.snapshot()).rejects.toThrow(
      "SAFETY_ABORT: API RSS limit reached",
    );

    const reused = new CapacitySafetyMonitor(
      healthyPool(),
      123,
      sampler([metric(0, 1000, 1, "first"), metric(1, 1001, 1, "second")]),
    );
    await reused.snapshot();
    await expect(reused.snapshot()).rejects.toThrow("process identity changed");

    const nonMonotonic = new CapacitySafetyMonitor(
      healthyPool(),
      123,
      sampler([metric(0, 1000), metric(1, 999)]),
    );
    await nonMonotonic.snapshot();
    await expect(nonMonotonic.snapshot()).rejects.toThrow(
      "API CPU sample is invalid",
    );
  });

  it("evaluates database capacity before accepting a healthy process sample", async () => {
    await expect(
      new CapacitySafetyMonitor(
        healthyPool(SAFETY_LIMITS.databaseActiveConnections),
        123,
        sampler([metric(0, 1000)]),
      ).snapshot(),
    ).rejects.toThrow("SAFETY_ABORT: database connection limit reached");
  });
});
