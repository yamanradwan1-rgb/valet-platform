/** Offline benchmark accounting only. Never imported by production runtime. */
export interface RuntimeMetricSample {
  readonly process: { readonly pid: number; readonly startedAtMs: number };
  readonly sampledAtMs: number;
  readonly collectedAtMs: number;
  readonly metrics: Readonly<Record<string, string>>;
}

export const runtimeCounterFields = [
  "acquisitions",
  "acquisitionMs",
  "nativeAcquisitionAttempts",
  "nativeAcquisitionMs",
  "acquisitionsOver200Ms",
  "leaseCompletions",
  "leaseMs",
  "rejected",
  "failures",
  "acquisitionTimeouts",
  "connectionFailures",
  "leaseSetupFailures",
  "expiredAcquisitions",
  "releaseFailures",
  "leaseExpirations",
  "queryTimeouts",
  "initializationFailures",
  "poolErrors",
  "clientErrors",
  "statementTimeouts",
  "lockTimeouts",
  "transactionTimeouts",
  "cpuUserMicros",
  "cpuSystemMicros",
  "limiterCleanupRuns",
  "limiterDeletedRows",
  "limiterCleanupFailures",
  "limiterCleanupDurationMs",
] as const;
const arrays = {
  acquisitionBuckets: 6,
  leaseBuckets: 7,
  queryCounts: 4,
  queryMs: 4,
} as const;
const gauges = [
  "configuredMax",
  "queueCapacity",
  "admitted",
  "leased",
  "acquiring",
  "waiting",
  "active",
  "total",
  "idle",
  "peakAdmitted",
  "peakWaiting",
] as const;

function invalid(): never {
  // No supplied values, credentials, raw log lines or arbitrary keys in errors.
  throw new Error(
    "Invalid runtime metric window; preserve snapshots and recollect within one process.",
  );
}
function integer(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return invalid();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return invalid();
  return number;
}
function sample(sample: RuntimeMetricSample, release: string) {
  if (!sample || !sample.process || !sample.metrics) return invalid();
  const { pid, startedAtMs } = sample.process;
  const { sampledAtMs, collectedAtMs, metrics } = sample;
  if (
    ![pid, startedAtMs, sampledAtMs, collectedAtMs].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    metrics.releaseSha !== release ||
    collectedAtMs < sampledAtMs ||
    collectedAtMs - sampledAtMs > 5000
  )
    return invalid();
  const uptime = integer(metrics.uptimeSeconds);
  if (
    sampledAtMs < startedAtMs ||
    Math.abs(sampledAtMs - startedAtMs - uptime * 1000) > 2000
  )
    return invalid();
  const counters = Object.fromEntries(
    runtimeCounterFields.map((key) => [key, integer(metrics[key])]),
  );
  const vectors = Object.fromEntries(
    Object.entries(arrays).map(([key, length]) => {
      const entries = metrics[key]?.split(",");
      if (!entries || entries.length !== length) return invalid();
      return [key, entries.map(integer)];
    }),
  );
  const state = Object.fromEntries(
    gauges.map((key) => [key, integer(metrics[key])]),
  );
  return { counters, vectors, state, uptime };
}

export function measureRuntimeMetricWindow(
  before: RuntimeMetricSample,
  after: RuntimeMetricSample,
  expectedReleaseSha: string,
) {
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) return invalid();
  const first = sample(before, expectedReleaseSha);
  const last = sample(after, expectedReleaseSha);
  if (
    before.process.pid !== after.process.pid ||
    before.process.startedAtMs !== after.process.startedAtMs ||
    after.sampledAtMs <= before.sampledAtMs ||
    after.collectedAtMs < before.collectedAtMs ||
    last.uptime <= first.uptime ||
    last.state.configuredMax !== first.state.configuredMax ||
    last.state.queueCapacity !== first.state.queueCapacity
  )
    return invalid();
  // Require fresh quiescent boundaries, including the post-drain snapshot.
  for (const state of [first.state, last.state]) {
    if (
      ["admitted", "leased", "acquiring", "waiting", "active"].some(
        (key) => state[key] !== 0,
      )
    )
      return invalid();
    if (
      state.total !== state.idle ||
      state.configuredMax! < 1 ||
      state.queueCapacity! < 1
    )
      return invalid();
  }
  if (
    last.state.peakAdmitted! < first.state.peakAdmitted! ||
    last.state.peakWaiting! < first.state.peakWaiting!
  )
    return invalid();
  const subtract = (end: number, start: number) => {
    if (end < start) return invalid();
    return end - start;
  };
  return {
    counterWindowMs: after.sampledAtMs - before.sampledAtMs,
    counters: Object.fromEntries(
      runtimeCounterFields.map((key) => [
        key,
        subtract(last.counters[key]!, first.counters[key]!),
      ]),
    ),
    vectors: Object.fromEntries(
      Object.keys(arrays).map((key) => [
        key,
        last.vectors[key]!.map((n, i) => subtract(n, first.vectors[key]![i]!)),
      ]),
    ),
    // Lifetime peaks and instantaneous gauges are preserved, never subtracted.
    beforeState: first.state,
    afterState: last.state,
  };
}
