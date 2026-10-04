import { describe, expect, it } from "vitest";
import { evaluateShiftPresence } from "../src/modules/shifts/shift-presence-evaluator";

const scope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  locationId: "00000000-0000-4000-8000-000000000002",
};
const now = new Date("2026-10-04T12:00:00Z");
const measurement = {
  latitude: 0,
  longitude: 0,
  accuracyMeters: 10,
  capturedAt: now.toISOString(),
};
const zone = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000003",
  code: "SYNTHETIC",
  label: "Synthetic zone",
  latitude: 0,
  longitude: 0,
  radiusMeters: 100,
  state: "ACTIVE",
  revision: 1,
};
function evaluate(patch: Record<string, unknown>, zones: unknown[] = [zone]) {
  return evaluateShiftPresence({
    scope,
    now,
    zones,
    measurement: { ...measurement, ...patch },
    policy: {
      startMode: "REQUIRE",
      endMode: "REQUIRE",
      maxAccuracyMeters: 50,
      maxFixAgeSeconds: 30,
    },
  });
}

describe("source signal does not introduce an evaluation policy", () => {
  it.each([
    [{}, "INSIDE"],
    [{ longitude: 0.002 }, "OUTSIDE"],
    [{ longitude: 0.00089932 }, "EDGE"],
    [{ accuracyMeters: 51 }, "INACCURATE_FIX"],
    [{ capturedAt: "2026-10-04T11:59:29Z" }, "STALE_FIX"],
    [{ capturedAt: "2026-10-04T12:00:06Z" }, "FUTURE_FIX"],
    [{ latitude: 91 }, "INVALID_FIX"],
  ] as const)(
    "preserves complete %s evaluation, reason %s",
    (patch, reason) => {
      const baseline = evaluate(patch);
      expect(baseline.reason).toBe(reason);
      expect(evaluate({ ...patch, mocked: true })).toEqual(baseline);
      expect(evaluate({ ...patch, mocked: false })).toEqual(baseline);
    },
  );

  it("does not override unusable attendance configuration", () => {
    for (const mocked of [undefined, false, true]) {
      expect(evaluate(mocked === undefined ? {} : { mocked }, [])).toEqual(
        evaluate({}, []),
      );
      expect(evaluate(mocked === undefined ? {} : { mocked }, []).reason).toBe(
        "NO_ACTIVE_ZONE",
      );
    }
  });
});
