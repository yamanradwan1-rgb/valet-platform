import { describe, expect, it } from "vitest";
import {
  measureRuntimeMetricWindow,
  runtimeCounterFields,
  type RuntimeMetricSample,
} from "../tools/capacity/runtime-metric-window";

const release = "a".repeat(40);
function pair(): [RuntimeMetricSample, RuntimeMetricSample] {
  const metrics: Record<string, string> = {
    ...Object.fromEntries(runtimeCounterFields.map((key) => [key, "100"])),
    releaseSha: release,
    uptimeSeconds: "100",
    configuredMax: "4",
    queueCapacity: "128",
    admitted: "0",
    leased: "0",
    acquiring: "0",
    waiting: "0",
    active: "0",
    total: "4",
    idle: "4",
    peakAdmitted: "132",
    peakWaiting: "128",
    acquisitionBuckets: "100,0,0,0,0,0",
    leaseBuckets: "100,0,0,0,0,0,0",
    queryCounts: "100,100,100,100",
    queryMs: "100,100,100,100",
  };
  const before = {
    process: { pid: 42, startedAtMs: 100000 },
    sampledAtMs: 200000,
    collectedAtMs: 201000,
    metrics,
  };
  const after = structuredClone(before);
  after.sampledAtMs += 32000;
  after.collectedAtMs += 32000;
  after.metrics.uptimeSeconds = "132";
  after.metrics.rejected = "117";
  return [before, after];
}

describe("offline same-process benchmark counter accounting", () => {
  it("subtracts valid counters without mutating raw samples or subtracting lifetime peaks", () => {
    const [before, after] = pair();
    const raw = structuredClone([before, after]);
    const result = measureRuntimeMetricWindow(before, after, release);
    expect(result.counters.rejected).toBe(17);
    expect(result.counterWindowMs).toBe(32000);
    expect(result.afterState.peakAdmitted).toBe(132);
    expect(result.vectors.queryCounts).toEqual([0, 0, 0, 0]);
    expect([before, after]).toEqual(raw);
  });
  it("rejects the reported 212 -> 62 second restart instead of returning 862 acquisitions / 3 rejections", () => {
    const [before, after] = pair();
    const first = {
      ...before,
      metrics: {
        ...before.metrics,
        uptimeSeconds: "212",
        acquisitions: "10279",
        rejected: "114",
      },
    };
    const last = {
      ...after,
      metrics: {
        ...after.metrics,
        uptimeSeconds: "62",
        acquisitions: "11141",
        rejected: "117",
      },
    };
    expect(() => measureRuntimeMetricWindow(first, last, release)).toThrow(
      "Invalid runtime metric window",
    );
  });
  it.each([
    [
      "pid",
      (sample: RuntimeMetricSample) => ({
        ...sample,
        process: { ...sample.process, pid: 43 },
      }),
    ],
    [
      "PID reuse / creation time",
      (sample: RuntimeMetricSample) => ({
        ...sample,
        process: { ...sample.process, startedAtMs: 100001 },
      }),
    ],
    [
      "stale pulse",
      (sample: RuntimeMetricSample) => ({
        ...sample,
        collectedAtMs: sample.sampledAtMs + 5001,
      }),
    ],
    [
      "future pulse",
      (sample: RuntimeMetricSample) => ({
        ...sample,
        collectedAtMs: sample.sampledAtMs - 1,
      }),
    ],
  ])("rejects %s", (_name, mutate) => {
    const [before, after] = pair();
    expect(() =>
      measureRuntimeMetricWindow(before, mutate(after), release),
    ).toThrow();
  });
  it.each([
    ["releaseSha", "b".repeat(40)],
    ["uptimeSeconds", "99"],
    ["configuredMax", "6"],
    ["queueCapacity", "256"],
    ["nativeAcquisitionMs", "99"],
    ["rejected", "99"],
    ["queryMs", "99,100,100,100"],
    ["queryCounts", "1,2,3"],
    ["leaseBuckets", ""],
    ["acquisitions", "NaN"],
    ["leaseMs", "-1"],
    ["leaseMs", "9007199254740992"],
    ["admitted", "1"],
    ["leased", "1"],
    ["waiting", "1"],
    ["acquiring", "1"],
    ["active", "1"],
    ["peakAdmitted", "131"],
    ["peakWaiting", "127"],
  ])(
    "rejects invalid %s=%s rather than zero-clamping or ignoring it",
    (field, value) => {
      const [before, after] = pair();
      expect(() =>
        measureRuntimeMetricWindow(
          before,
          { ...after, metrics: { ...after.metrics, [field]: value } },
          release,
        ),
      ).toThrow();
    },
  );
  it("rejects missing counters and unverified releases with fixed non-sensitive errors", () => {
    const [before, after] = pair();
    const metrics = { ...after.metrics, rejected: "secret-must-not-appear" };
    expect(() =>
      measureRuntimeMetricWindow(before, { ...after, metrics }, release),
    ).toThrow(/^Invalid runtime metric window;/);
    expect(() =>
      measureRuntimeMetricWindow(before, after, "UNVERIFIED"),
    ).toThrow();
    const incomplete = { ...after.metrics };
    delete incomplete.queryMs;
    expect(() =>
      measureRuntimeMetricWindow(
        before,
        { ...after, metrics: incomplete },
        release,
      ),
    ).toThrow();
  });
});
