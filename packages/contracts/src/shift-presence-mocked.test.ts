import { describe, expect, it } from "vitest";
import { shiftPresenceMeasurementSchema } from "./shift-presence.js";
import { shiftPresenceEvidenceSchema } from "./shift-presence-public.js";
import { endShiftRequestSchema, startShiftRequestSchema } from "./shifts.js";

const id = "00000000-0000-4000-8000-000000000001";
const measurement = {
  latitude: 0,
  longitude: 0,
  accuracyMeters: 5,
  capturedAt: "2026-10-04T12:00:00.000Z",
};
const evidence = {
  kind: "MEASURED" as const,
  operationId: id,
  challengeId: id,
  clientSampleId: id,
  measurement,
};
const signals = [undefined, false, true] as const;

describe("nested measured source signal compatibility", () => {
  it.each(signals)(
    "preserves mocked=%s in measurement, START and END",
    (mocked) => {
      const fix = {
        ...measurement,
        ...(mocked === undefined ? {} : { mocked }),
      };
      const presence = { ...evidence, measurement: fix };
      expect(shiftPresenceMeasurementSchema.parse(fix)).toEqual(fix);
      expect(shiftPresenceEvidenceSchema.parse(presence)).toEqual(presence);
      const start = { targetLocationId: id, operationId: id, presence };
      const end = { cashReported: "0", operationId: id, presence };
      expect(startShiftRequestSchema.parse(start)).toEqual(start);
      expect(endShiftRequestSchema.parse(end)).toEqual(end);
      if (mocked === undefined) {
        expect(shiftPresenceMeasurementSchema.parse(fix)).not.toHaveProperty(
          "mocked",
        );
      }
    },
  );

  it.each(["true", "false", 1, 0, null, [], {}])(
    "rejects invalid mocked value %j throughout START and END",
    (mocked) => {
      const fix = { ...measurement, mocked };
      const presence = { ...evidence, measurement: fix };
      expect(shiftPresenceMeasurementSchema.safeParse(fix).success).toBe(false);
      expect(
        startShiftRequestSchema.safeParse({ targetLocationId: id, presence })
          .success,
      ).toBe(false);
      expect(
        endShiftRequestSchema.safeParse({ cashReported: "0", presence })
          .success,
      ).toBe(false);
    },
  );

  it("retains strict measurement fields and the existing nested shape", () => {
    expect(
      shiftPresenceMeasurementSchema.safeParse({
        ...measurement,
        mocked: true,
        source: "simulator",
      }).success,
    ).toBe(false);
    expect(
      shiftPresenceEvidenceSchema.safeParse({ ...evidence, mocked: true })
        .success,
    ).toBe(false);
  });

  it.each(signals)(
    "retains operation selector equality with mocked=%s",
    (mocked) => {
      const presence = {
        ...evidence,
        measurement: {
          ...measurement,
          ...(mocked === undefined ? {} : { mocked }),
        },
      };
      const operationId = "00000000-0000-4000-8000-000000000002";
      expect(
        startShiftRequestSchema.safeParse({
          targetLocationId: id,
          operationId,
          presence,
        }).success,
      ).toBe(false);
      expect(
        endShiftRequestSchema.safeParse({
          cashReported: "0",
          operationId,
          presence,
        }).success,
      ).toBe(false);
    },
  );
});
