import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GpsIngestionTestContext } from "./gps-ingestion-test-context";

describe("VAL-007D GPS durable idempotency", () => {
  const context = new GpsIngestionTestContext("idempotency");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("returns DUPLICATE for an exact canonical retry and stores one row", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const sample = await context.sample();
    await expect(context.ingest(fixture, [sample])).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
    ]);
    await expect(context.ingest(fixture, [sample])).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "DUPLICATE" },
    ]);
    expect(await context.rawSamples(fixture)).toHaveLength(1);
  });

  it("conflicts on changed canonical payload and rolls back every new row", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const persisted = await context.sample();
    await context.ingest(fixture, [persisted]);
    const newSample = await context.sample();
    const conflict = { ...persisted, latitude: persisted.latitude + 0.01 };
    await expect(
      context.ingest(fixture, [conflict, newSample]),
    ).rejects.toMatchObject({ code: "GPS_SAMPLE_IDEMPOTENCY_CONFLICT" });
    const rows = await context.rawSamples(fixture);
    expect(rows.map((row) => row.client_sample_id)).toEqual([
      persisted.clientSampleId,
    ]);
  });

  it("excludes accuracy from identity", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const sample = await context.sample({ accuracyMeters: 4 });
    await context.ingest(fixture, [sample]);
    await expect(
      context.ingest(fixture, [{ ...sample, accuracyMeters: 99 }]),
    ).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "DUPLICATE" },
    ]);
  });

  it("uses DECIMAL(9,6) and TIMESTAMPTZ(3) canonical identity", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const now = new Date((await context.databaseTime()).getTime() + 1_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, ".1234Z");
    const sample = await context.sample({
      capturedAt: now,
      latitude: 31.12345641,
      longitude: 35.12345641,
    });
    await context.ingest(fixture, [sample]);
    await expect(
      context.ingest(fixture, [
        {
          ...sample,
          capturedAt: now.replace(".1234Z", ".12349Z"),
          latitude: 31.12345642,
          longitude: 35.12345642,
        },
      ]),
    ).resolves.toEqual([
      { clientSampleId: sample.clientSampleId, status: "DUPLICATE" },
    ]);
  });

  it("succeeds deterministically with mixed DUPLICATE and ACCEPTED samples", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const duplicate = await context.sample();
    await context.ingest(fixture, [duplicate]);
    const accepted = await context.sample({ capturedAt: duplicate.capturedAt });
    await expect(
      context.ingest(fixture, [duplicate, accepted]),
    ).resolves.toEqual([
      { clientSampleId: duplicate.clientSampleId, status: "DUPLICATE" },
      { clientSampleId: accepted.clientSampleId, status: "ACCEPTED" },
    ]);
    expect(await context.rawSamples(fixture)).toHaveLength(2);
  });

  it("concurrent same-sample requests converge to one row", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const sample = await context.sample();
    const results = await Promise.all([
      context.ingest(fixture, [sample]),
      context.ingest(fixture, [sample]),
    ]);
    expect(
      results
        .flat()
        .map((row) => row.status)
        .sort(),
    ).toEqual(["ACCEPTED", "DUPLICATE"]);
    expect(await context.rawSamples(fixture)).toHaveLength(1);
  });

  it("does not create AuditEvent or GeofenceEvent rows", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const before = await context.trackingCounts(fixture);
    await context.ingest(fixture, [await context.sample()]);
    const after = await context.trackingCounts(fixture);
    expect(after).toEqual({
      audit_count: before.audit_count,
      geofence_count: before.geofence_count,
      raw_count: before.raw_count + 1,
    });
  });
});
