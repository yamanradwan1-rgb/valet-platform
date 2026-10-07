import { describe, expect, it } from "vitest";

import { EmployeeGpsSampleBuffer } from "./employee-gps-sample-buffer";

function ids() {
  let value = 0;
  return () =>
    `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
}

function fix(capturedAt: string, latitude = 31.95) {
  return {
    accuracyMeters: 8,
    capturedAt,
    latitude,
    longitude: 35.91,
  };
}

describe("#270 transient GPS sample buffer", () => {
  it("creates one immutable UUID payload and orders a batch chronologically", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids() });
    const later = buffer.admit(fix("2026-10-07T00:00:10.000Z"), 10_000);
    const earlier = buffer.admit(fix("2026-10-07T00:00:05.000Z"), 10_001);

    expect(later).not.toBeNull();
    expect(earlier).not.toBeNull();
    expect(Object.isFrozen(later)).toBe(true);
    const batch = buffer.beginBatch(10_002)!;
    expect(batch.map((sample) => sample.capturedAt)).toEqual([
      "2026-10-07T00:00:05.000Z",
      "2026-10-07T00:00:10.000Z",
    ]);
    expect(new Set(batch.map((sample) => sample.clientSampleId)).size).toBe(2);
  });

  it("counts in-flight work against the 50-sample resident cap", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids() });
    for (let index = 0; index < 50; index += 1) {
      expect(
        buffer.admit(
          fix(new Date(1_000 + index).toISOString(), 31 + index / 1000),
          index,
        ),
      ).not.toBeNull();
    }
    expect(buffer.residentCount).toBe(50);
    expect(buffer.beginBatch(50)).toHaveLength(50);
    expect(buffer.inFlightCount).toBe(50);
    expect(buffer.admit(fix(new Date(2_000).toISOString()), 51)).toBeNull();
    expect(buffer.residentCount).toBe(50);
  });

  it("evicts the oldest unsent sample on overflow without rewriting in-flight work", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids(), capacity: 3 });
    const first = buffer.admit(fix("2026-10-07T00:00:01.000Z"), 1)!;
    const second = buffer.admit(fix("2026-10-07T00:00:02.000Z"), 2)!;
    const inFlight = buffer.beginBatch(3)!;
    expect(inFlight.map((sample) => sample.clientSampleId)).toEqual([
      first.clientSampleId,
      second.clientSampleId,
    ]);
    const third = buffer.admit(fix("2026-10-07T00:00:03.000Z"), 4)!;
    const fourth = buffer.admit(fix("2026-10-07T00:00:04.000Z"), 5)!;
    expect(fourth).not.toBeNull();
    expect(buffer.residentCount).toBe(3);
    buffer.acceptResponse({
      samples: inFlight.map((sample) => ({
        clientSampleId: sample.clientSampleId,
        status: "ACCEPTED" as const,
      })),
    });
    const remaining = buffer.beginBatch(6)!;
    expect(remaining.map((sample) => sample.clientSampleId)).toEqual([
      fourth.clientSampleId,
    ]);
    expect(remaining.some((sample) => sample.clientSampleId === third.clientSampleId)).toBe(
      false,
    );
  });

  it("removes a batch only after coherent ACCEPTED or DUPLICATE identities", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids() });
    const sample = buffer.admit(fix("2026-10-07T00:00:01.000Z"), 1)!;
    buffer.beginBatch(2);

    expect(
      buffer.acceptResponse({
        samples: [
          {
            clientSampleId: "99999999-9999-4999-8999-999999999999",
            status: "ACCEPTED",
          },
        ],
      }),
    ).toBe(false);
    expect(buffer.residentCount).toBe(1);
    buffer.markUnknown();
    expect(buffer.beginBatch(3)?.[0]).toBe(sample);
    expect(
      buffer.acceptResponse({
        samples: [{ clientSampleId: sample.clientSampleId, status: "DUPLICATE" }],
      }),
    ).toBe(true);
    expect(buffer.residentCount).toBe(0);
  });

  it("retries an unknown result with the identical ordered payload", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids() });
    buffer.admit(fix("2026-10-07T00:00:02.000Z"), 1);
    buffer.admit(fix("2026-10-07T00:00:01.000Z"), 2);
    const first = buffer.beginBatch(3)!;
    buffer.markUnknown();
    buffer.admit(fix("2026-10-07T00:00:03.000Z"), 4);
    const retry = buffer.beginBatch(5)!;

    expect(retry).toEqual(first);
    expect(retry.map((sample) => sample.clientSampleId)).toEqual(
      first.map((sample) => sample.clientSampleId),
    );
  });

  it("expires an unknown batch as one unit at the bounded retry horizon", () => {
    const buffer = new EmployeeGpsSampleBuffer({
      createId: ids(),
      pendingLifetimeMs: 120_000,
    });
    buffer.admit(fix("2026-10-07T00:00:01.000Z"), 0);
    buffer.admit(fix("2026-10-07T00:00:02.000Z"), 1_000);
    buffer.beginBatch(2_000);
    buffer.markUnknown();

    expect(buffer.beginBatch(120_000)).toBeNull();
    expect(buffer.residentCount).toBe(0);
  });

  it("rejects invalid physical fixes and clears retired scope memory", () => {
    const buffer = new EmployeeGpsSampleBuffer({ createId: ids() });
    expect(
      buffer.admit(
        { ...fix("2026-10-07T00:00:01.000Z"), accuracyMeters: 101 },
        0,
      ),
    ).toBeNull();
    buffer.admit(fix("2026-10-07T00:00:02.000Z"), 1);
    buffer.clear();
    expect(buffer.residentCount).toBe(0);
    expect(buffer.beginBatch(2)).toBeNull();
  });
});
