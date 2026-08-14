import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GeofenceTestContext, insideA, outside } from "./geofence-test-context";

describe("VAL-007E operational frontier and GPS composition", () => {
  const context = new GeofenceTestContext("frontier");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("does not derive events for a DUPLICATE retry", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const [sample] = await context.samples([insideA]);
    await context.ingest(fixture, [sample!]);
    const before = await context.events(fixture);
    await expect(context.ingest(fixture, [sample!])).resolves.toMatchObject([
      { status: "DUPLICATE" },
    ]);
    expect(await context.events(fixture)).toEqual(before);
  });

  it("rolls back events on GPS idempotency conflict", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const [baseline] = await context.samples([outside]);
    await context.ingest(fixture, [baseline!]);
    const [next] = await context.samples(
      [insideA],
      new Date(Date.parse(baseline!.capturedAt) + 1_000),
    );
    await expect(
      context.ingest(fixture, [
        { ...baseline!, latitude: baseline!.latitude + 0.1 },
        next!,
      ]),
    ).rejects.toMatchObject({ code: "GPS_SAMPLE_IDEMPOTENCY_CONFLICT" });
    expect(await context.events(fixture)).toEqual([]);
    expect(await context.rawSamples(fixture)).toHaveLength(1);
  });

  it("writes no events for a rejected GPS request", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "RESTRICTED");
    await context.adminPool.query(
      `UPDATE task_tracking_sessions SET ended_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.trackingSessionId],
    );
    await expect(
      context.ingest(fixture, await context.samples([insideA])),
    ).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    expect(await context.events(fixture)).toEqual([]);
  });

  it("concurrent duplicate ingestion creates one event history", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const [sample] = await context.samples([insideA]);
    const results = await Promise.all([
      context.ingest(fixture, [sample!]),
      context.ingest(fixture, [sample!]),
    ]);
    expect(
      results
        .flat()
        .map((result) => result.status)
        .sort(),
    ).toEqual(["ACCEPTED", "DUPLICATE"]);
    expect(await context.events(fixture)).toHaveLength(1);
  });

  it("stores earlier backfill without retroactive events", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const now = await context.databaseTime();
    const [frontier] = await context.samples(
      [outside],
      new Date(now.getTime() + 2_000),
    );
    await context.ingest(fixture, [frontier!]);
    const [backfill] = await context.samples(
      [insideA],
      new Date(now.getTime() + 1_000),
    );
    await context.ingest(fixture, [backfill!]);
    expect(await context.rawSamples(fixture)).toHaveLength(2);
    expect(await context.events(fixture)).toEqual([]);
  });

  it("advances an equal-time sample whose persisted route key sorts after", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const now = await context.databaseTime();
    const frontierClientId = await context.seedRawSample(fixture, {
      capturedAt: now,
      id: "00000000-0000-0000-0000-000000000000",
      point: outside,
    });
    const [equal] = await context.samples([insideA], now);
    await context.ingest(fixture, [equal!]);
    const route = await context.rawRoute(fixture);
    expect(route.map((sample) => sample.client_sample_id)).toEqual([
      frontierClientId,
      equal!.clientSampleId,
    ]);
    expect(
      (await context.events(fixture)).map((event) => event.event_type),
    ).toEqual(["ENTERED"]);

    const [later] = await context.samples(
      [outside],
      new Date(now.getTime() + 1_000),
    );
    await context.ingest(fixture, [later!]);
    expect(
      (await context.events(fixture)).map((event) => event.event_type),
    ).toEqual(["ENTERED", "EXITED", "VIOLATION"]);
  });

  it("keeps an equal-time sample whose persisted route key sorts before as history", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const now = await context.databaseTime();
    const frontierClientId = await context.seedRawSample(fixture, {
      capturedAt: now,
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      point: outside,
    });
    const [equal] = await context.samples([insideA], now);
    await context.ingest(fixture, [equal!]);
    const route = await context.rawRoute(fixture);
    expect(route.map((sample) => sample.client_sample_id)).toEqual([
      equal!.clientSampleId,
      frontierClientId,
    ]);
    expect(await context.events(fixture)).toEqual([]);

    const [later] = await context.samples(
      [insideA],
      new Date(now.getTime() + 1_000),
    );
    await context.ingest(fixture, [later!]);
    expect(
      (await context.events(fixture)).map((event) => event.event_type),
    ).toEqual(["ENTERED"]);
  });

  it("evaluates later movement from the prior frontier, not backfill", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const now = await context.databaseTime();
    const [frontier] = await context.samples(
      [outside],
      new Date(now.getTime() + 2_000),
    );
    const [backfill] = await context.samples(
      [insideA],
      new Date(now.getTime() + 1_000),
    );
    const [later] = await context.samples(
      [insideA],
      new Date(now.getTime() + 3_000),
    );
    await context.ingest(fixture, [frontier!]);
    await context.ingest(fixture, [backfill!]);
    await context.ingest(fixture, [later!]);
    expect(
      (await context.events(fixture)).map((event) => event.event_type),
    ).toEqual(["ENTERED"]);
  });
});
