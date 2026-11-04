import { describe, expect, it } from "vitest";
import {
  issue414CriticalPoolDeltas,
  issue414HttpTelemetryValid,
} from "./issue414-http-telemetry";

const healthy = (): Record<string, unknown> => ({
  actualMountedPoolMax: 4,
  pgActivitySamples: 600,
  samplerErrors: [],
  ...Object.fromEntries(issue414CriticalPoolDeltas.map((key) => [key, 0])),
});

describe("Issue414 actual HTTP/PG pool telemetry gate", () => {
  it("accepts complete healthy runtime observations", () => {
    expect(issue414HttpTelemetryValid(healthy())).toBe(true);
  });

  it.each(issue414CriticalPoolDeltas)(
    "fails closed on missing or elevated %s",
    (key) => {
      const missing = healthy();
      delete missing[key];
      expect(issue414HttpTelemetryValid(missing)).toBe(false);
      const elevated = healthy();
      elevated[key] = 1;
      expect(issue414HttpTelemetryValid(elevated)).toBe(false);
    },
  );

  it("requires positive PG samples and no sampler error", () => {
    expect(
      issue414HttpTelemetryValid({ ...healthy(), pgActivitySamples: 0 }),
    ).toBe(false);
    expect(
      issue414HttpTelemetryValid({
        ...healthy(),
        samplerErrors: ["TimeoutError"],
      }),
    ).toBe(false);
  });
});
