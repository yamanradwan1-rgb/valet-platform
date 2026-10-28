import { describe, expect, it } from "vitest";
import { ConditionPhotoProcessingMetrics } from "../src/modules/vehicle-photos/condition-photo-processing-metrics";

describe("bounded private photo diagnostics", () => {
  it("exports fixed buckets, valid percentile bounds and copied snapshots", () => {
    const metrics = new ConditionPhotoProcessingMetrics();
    for (const value of [0.5, 10, 80, 900, 4000])
      metrics.observe("queue", value);
    const before = metrics.snapshot();
    expect(before.timingPercentileUpperBoundsMs.queue).toEqual({
      p50: 100,
      p95: 5000,
      p99: 5000,
    });
    expect(before.timingTotalsMs.queue).toBe(4990.5);
    expect(before.timingPercentileUpperBoundsMs.processing).toEqual({
      p50: null,
      p95: null,
      p99: null,
    });
    expect(before.timings.queue!.reduce((sum, value) => sum + value, 0)).toBe(
      5,
    );
    metrics.observe("queue", 15001);
    expect(before.timings.queue!.reduce((sum, value) => sum + value, 0)).toBe(
      5,
    );
    expect(
      metrics.snapshot().timingPercentileUpperBoundsMs.queue?.p99,
    ).toBeNull();
    expect(JSON.stringify(before)).not.toMatch(
      /token|credential|operationId|sessionId|tenant|bytesBase64/i,
    );
  });
});
