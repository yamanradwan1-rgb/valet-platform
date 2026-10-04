import { describe, expect, it } from "vitest";
import {
  startShiftRequestSchema,
  endShiftRequestSchema,
  startShiftResponseSchema,
  endShiftResponseSchema,
} from "./shifts.js";

const operationId = "56948a68-e7e4-496f-96f6-ed9221d4d6f1";
const other = "01da4f9e-f753-46e7-a7a9-d1e1ff3c9b1d";
const presence = {
  kind: "MEASURED",
  operationId,
  challengeId: other,
  clientSampleId: operationId,
  measurement: {
    latitude: 31.95,
    longitude: 35.91,
    accuracyMeters: 5,
    capturedAt: "2026-10-04T10:00:00Z",
  },
};

describe.each([
  ["START", startShiftRequestSchema, { targetLocationId: other }],
  ["END", endShiftRequestSchema, { cashReported: "7.000" }],
] as const)("%s optional correlation selector", (_action, schema, intent) => {
  it("preserves legacy/evidence-only and accepts exact optional selectors", () => {
    for (const fields of [
      {},
      { operationId },
      { presence },
      { operationId, presence },
    ])
      expect(schema.safeParse({ ...intent, ...fields }).success).toBe(true);
  });
  it("rejects invalid or inconsistent selectors and unknown fields", () => {
    for (const fields of [
      { operationId: "invalid" },
      { operationId: other, presence },
      { operationId, extra: true },
    ])
      expect(schema.safeParse({ ...intent, ...fields }).success).toBe(false);
  });
  it("keeps MISSING and CORRELATED_MISSING strictly server-internal", () => {
    for (const kind of ["MISSING", "CORRELATED_MISSING"])
      expect(
        schema.safeParse({
          ...intent,
          operationId,
          presence: { kind, operationId, challengeId: other },
        }).success,
      ).toBe(false);
  });
  it("supports matching EXCEPTION evidence without removing its selector", () => {
    const exception = {
      kind: "EXCEPTION",
      operationId,
      challengeId: other,
      exceptionId: other,
    };
    expect(schema.safeParse({ ...intent, presence: exception }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ ...intent, operationId, presence: exception }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...intent, operationId: other, presence: exception })
        .success,
    ).toBe(false);
  });
});

it("keeps successful Shift response shapes unchanged", () => {
  const start = {
    shiftId: operationId,
    locationId: other,
    startedAt: "2026-10-04T10:00:00Z",
    endedAt: null,
    status: "ACTIVE",
  };
  const end = {
    ...start,
    endedAt: "2026-10-04T11:00:00Z",
    status: "ENDED",
    cashReconciliation: {
      cashExpected: "0",
      cashReported: "7.000",
      cashVariance: "7",
      currency: "JOD",
      reportedAt: "2026-10-04T11:00:00Z",
    },
  };
  expect(startShiftResponseSchema.safeParse(start).success).toBe(true);
  expect(endShiftResponseSchema.safeParse(end).success).toBe(true);
  expect(
    startShiftResponseSchema.safeParse({ ...start, operationId }).success,
  ).toBe(false);
  expect(
    endShiftResponseSchema.safeParse({ ...end, operationId }).success,
  ).toBe(false);
});
