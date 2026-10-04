import { describe, expect, it } from "vitest";

import { evaluateShiftPresence, circularDistanceMeters } from "../src/modules/shifts/shift-presence-evaluator";

const scope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  locationId: "00000000-0000-4000-8000-000000000002",
};
const now = new Date("2026-10-04T00:00:00Z");
const zone = { ...scope, id: "00000000-0000-4000-8000-000000000003", code: "GATE", label: "Gate",
  latitude: 0, longitude: 0, radiusMeters: 100, state: "ACTIVE" as const, revision: 1 };
const fix = { latitude: 0, longitude: 0, accuracyMeters: 10, capturedAt: now.toISOString() };
function evaluate(patch = {}, zones: unknown[] = [zone]) {
  return evaluateShiftPresence({ scope, now, zones, measurement: { ...fix, ...patch },
    policy: { startMode: "OFF", endMode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 } });
}

describe("pure attendance evaluator, synthetic coordinates", () => {
  it("accepts the center with positive uncertainty", () => {
    expect(evaluate().classification).toBe("CONFIDENT_INSIDE");
  });
  it("separates clearly outside and ambiguous uncertainty", () => {
    expect(evaluate({ longitude: 0.002 }).classification).toBe("CONFIDENT_OUTSIDE");
    expect(evaluate({ longitude: 0.00089932 }).classification).toBe("AMBIGUOUS_EDGE");
  });
  it("preserves exact inside and outside inequality boundaries", () => {
    const d = circularDistanceMeters(0, 0, 0, 0.0005);
    expect(evaluate({ longitude: 0.0005 }, [{ ...zone, radiusMeters: d + 10 }]).classification).toBe("CONFIDENT_INSIDE");
    expect(evaluate({ longitude: 0.0005 }, [{ ...zone, radiusMeters: d + 10 - 0.001 }]).classification).toBe("AMBIGUOUS_EDGE");
    expect(evaluate({ longitude: 0.0005 }, [{ ...zone, radiusMeters: d - 10 }]).classification).toBe("AMBIGUOUS_EDGE");
    expect(evaluate({ longitude: 0.0005 }, [{ ...zone, radiusMeters: d - 10 - 0.001 }]).classification).toBe("CONFIDENT_OUTSIDE");
  });
  it("accepts any active zone, otherwise requires outside all", () => {
    expect(evaluate({}, [{ ...zone, longitude: 1 }, zone]).classification).toBe("CONFIDENT_INSIDE");
    expect(evaluate({}, [{ ...zone, longitude: 1 }, { ...zone, longitude: 0.00089932 }]).classification).toBe("AMBIGUOUS_EDGE");
    expect(evaluate({}, [{ ...zone, longitude: 1 }, { ...zone, longitude: 2 }]).classification).toBe("CONFIDENT_OUTSIDE");
  });
  it("distinguishes disabled, empty and invalid configuration from outside", () => {
    for (const zones of [[], [{ ...zone, state: "DISABLED" }], [{ ...zone, radiusMeters: NaN }]]) {
      expect(evaluate({}, zones).classification).toBe("CONFIGURATION_UNUSABLE");
    }
    expect(() => evaluate({}, [{ ...zone, locationId: scope.organizationId }])).toThrow("PRESENCE_SCOPE_MISMATCH");
  });
  it.each([{ latitude: 91 }, { latitude: NaN }, { longitude: -181 }, { longitude: Infinity },
    { accuracyMeters: 0 }, { accuracyMeters: -1 }, { accuracyMeters: NaN }, { accuracyMeters: Infinity }])("rejects invalid fix %j", (patch) => {
    expect(evaluate(patch)).toMatchObject({ classification: "MEASUREMENT_UNUSABLE", reason: "INVALID_FIX" });
  });
  it("rejects pre-challenge evidence and reports only checks actually evaluated", () => {
    const input = { scope, now, zones: [zone], policy: { startMode: "OFF", endMode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
      issuedAt: now, measurement: { ...fix, capturedAt: "2026-10-03T23:59:54.999Z" } };
    expect(evaluateShiftPresence(input).reason).toBe("INVALID_FIX");
    expect(evaluateShiftPresence({ ...input, measurement: { ...fix, capturedAt: "2026-10-03T23:59:55Z" } }).reason).toBe("INSIDE");
    expect(evaluate({ accuracyMeters: 51 })).toMatchObject({ accuracyBand: "UNUSABLE", freshnessBand: "NOT_EVALUATED" });
    expect(evaluateShiftPresence({ ...input, policy: {} })).toMatchObject({ accuracyBand: "NOT_EVALUATED", freshnessBand: "NOT_EVALUATED" });
  });
  it("enforces accuracy, freshness and future skew inclusively", () => {
    expect(evaluate({ accuracyMeters: 51 }).reason).toBe("INACCURATE_FIX");
    expect(evaluate({ capturedAt: "2026-10-03T23:59:29.999Z" }).reason).toBe("STALE_FIX");
    expect(evaluate({ capturedAt: "2026-10-04T00:00:05.001Z" }).reason).toBe("FUTURE_FIX");
    expect(evaluate({ capturedAt: "2026-10-03T23:59:30Z", accuracyMeters: 50 }).classification).toBe("CONFIDENT_INSIDE");
    expect(evaluate({ capturedAt: "2026-10-04T00:00:05Z" }).classification).toBe("CONFIDENT_INSIDE");
  });
  it("handles dateline and high latitude without a planar shortcut", () => {
    expect(circularDistanceMeters(0, 179.999, 0, -179.999)).toBeCloseTo(222.39, 1);
    expect(circularDistanceMeters(90, -180, 90, 180)).toBeLessThan(0.000001);
    expect(circularDistanceMeters(89.999, 0, 89.999, 180)).toBeCloseTo(222.39, 1);
    expect(evaluate({ longitude: -179.999 }, [{ ...zone, longitude: 179.999, radiusMeters: 300 }]).classification).toBe("CONFIDENT_INSIDE");
  });
});
