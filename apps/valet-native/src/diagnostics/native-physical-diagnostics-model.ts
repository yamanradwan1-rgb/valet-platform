export type PhysicalMetric =
  | "js_bootstrap_to_operational_ready_ms"
  | "task_list_ready_ms"
  | "camera_ready_ms"
  | "reconnect_recovery_ms"
  | "check_in_field_time_ms";

export type PhysicalOutcome = "success" | "failure";
export type PhysicalFailureClass =
  | "network"
  | "timeout"
  | "auth-loss"
  | "cancelled"
  | "camera-unavailable"
  | "unknown";

export interface PhysicalSample {
  readonly metric: PhysicalMetric;
  readonly durationMs: number;
  readonly outcome: PhysicalOutcome;
  readonly warmColdClass: string;
  readonly timestamp: string;
  readonly failureClass?: PhysicalFailureClass;
}

export interface PhysicalMetricSummary {
  readonly samples: number;
  readonly minimumMs: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly maximumMs: number | null;
  readonly successes: number;
  readonly failures: number;
}

export interface PhysicalEvidence {
  readonly evidenceClass: "MOB-025A_PHYSICAL_ANDROID";
  readonly buildSha: string;
  readonly buildClass: "development";
  readonly device: { readonly platform: "android" };
  readonly metrics: Record<PhysicalMetric, PhysicalMetricSummary>;
  readonly samples: readonly PhysicalSample[];
}

export const physicalMetrics: readonly PhysicalMetric[] = [
  "js_bootstrap_to_operational_ready_ms",
  "task_list_ready_ms",
  "camera_ready_ms",
  "reconnect_recovery_ms",
  "check_in_field_time_ms",
];
const physicalClassifications = new Set([
  "restored-authenticated-session",
  "auth-required",
  "initial",
  "task-screen",
  "first",
  "warm",
  "network",
  "foreground",
  "operator-flow",
]);
const failureClasses = new Set<PhysicalFailureClass>([
  "network",
  "timeout",
  "auth-loss",
  "cancelled",
  "camera-unavailable",
  "unknown",
]);

function percentile(
  values: readonly number[],
  percentage: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((percentage / 100) * sorted.length) - 1] ?? null;
}

export function summarizePhysicalSamples(
  samples: readonly PhysicalSample[],
): PhysicalMetricSummary {
  const durations = samples.map((sample) => sample.durationMs);
  return {
    samples: samples.length,
    minimumMs: durations.length === 0 ? null : Math.min(...durations),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    maximumMs: durations.length === 0 ? null : Math.max(...durations),
    successes: samples.filter((sample) => sample.outcome === "success").length,
    failures: samples.filter((sample) => sample.outcome === "failure").length,
  };
}

export function createPhysicalEvidence(
  samples: readonly PhysicalSample[],
  buildSha = "OWNER_MUST_RECORD_TESTED_SHA",
): PhysicalEvidence {
  const metrics = Object.fromEntries(
    physicalMetrics.map((metric) => [
      metric,
      summarizePhysicalSamples(
        samples.filter((sample) => sample.metric === metric),
      ),
    ]),
  ) as Record<PhysicalMetric, PhysicalMetricSummary>;
  return {
    evidenceClass: "MOB-025A_PHYSICAL_ANDROID",
    buildSha,
    buildClass: "development",
    device: { platform: "android" },
    metrics,
    samples,
  };
}

export function parsePhysicalSamples(value: string): PhysicalSample[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPhysicalSample).slice(-200);
  } catch {
    return [];
  }
}

function isPhysicalSample(value: unknown): value is PhysicalSample {
  if (typeof value !== "object" || value === null) return false;
  const sample = value as Record<string, unknown>;
  const allowed = new Set([
    "metric",
    "durationMs",
    "outcome",
    "warmColdClass",
    "timestamp",
    "failureClass",
  ]);
  return (
    Object.keys(sample).every((key) => allowed.has(key)) &&
    physicalMetrics.includes(sample.metric as PhysicalMetric) &&
    typeof sample.durationMs === "number" &&
    Number.isFinite(sample.durationMs) &&
    sample.durationMs >= 0 &&
    (sample.outcome === "success" || sample.outcome === "failure") &&
    typeof sample.warmColdClass === "string" &&
    physicalClassifications.has(sample.warmColdClass) &&
    typeof sample.timestamp === "string" &&
    (sample.failureClass === undefined ||
      failureClasses.has(sample.failureClass as PhysicalFailureClass))
  );
}
