import type { RequestSample, Summary } from "./capacity-types";

export function percentile(
  values: readonly number[],
  fraction: number,
): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Number((sorted[index] ?? 0).toFixed(2));
}

export function summarize(
  samples: readonly RequestSample[],
  durationMs: number,
): Summary {
  const durations = samples.map((sample) => sample.durationMs);
  const errorCount = samples.filter(
    (sample) => sample.status < 200 || sample.status >= 300,
  ).length;
  return {
    count: samples.length,
    errorCount,
    errorRate:
      samples.length === 0
        ? 0
        : Number((errorCount / samples.length).toFixed(6)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    requestsPerSecond:
      durationMs <= 0
        ? 0
        : Number(((samples.length * 1_000) / durationMs).toFixed(2)),
  };
}
