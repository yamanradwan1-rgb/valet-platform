import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GpsIngestionTestContext } from "./gps-ingestion-test-context";

describe("VAL-007D GPS temporal validation", () => {
  const context = new GpsIngestionTestContext("validation");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  async function expectInvalid(
    fixture: Awaited<
      ReturnType<GpsIngestionTestContext["createParkingTrackingFixture"]>
    >,
    capturedAt: string,
  ) {
    await expect(
      context.ingest(fixture, [await context.sample({ capturedAt })]),
    ).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(await context.rawSamples(fixture)).toHaveLength(0);
  }

  it("rejects a stale sample while allowing tracker-window backfill", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const now = await context.databaseTime();
    await context.adminPool.query(
      `UPDATE task_tracking_sessions
       SET started_at = $2::timestamptz - interval '10 minutes'
       WHERE id = $1`,
      [fixture.trackingSessionId, now],
    );
    await expectInvalid(
      fixture,
      new Date(now.getTime() - 301_000).toISOString(),
    );
  });

  it("rejects capturedAt before tracker.started_at", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await expectInvalid(
      fixture,
      new Date(fixture.trackerStartedAt.getTime() - 1).toISOString(),
    );
  });

  it("rejects capturedAt more than 30 seconds in the future", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const now = await context.databaseTime();
    await expectInvalid(
      fixture,
      new Date(now.getTime() + 31_000).toISOString(),
    );
  });

  it("requires nondecreasing capturedAt within one request", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const now = await context.databaseTime();
    const first = await context.sample({ capturedAt: now.toISOString() });
    const second = await context.sample({
      capturedAt: new Date(now.getTime() - 1_000).toISOString(),
    });
    await expect(
      context.ingest(fixture, [first, second]),
    ).rejects.toMatchObject({
      code: "REQUEST_INVALID",
    });
    expect(await context.rawSamples(fixture)).toHaveLength(0);
  });

  it("accepts cross-request backfill independently inside the window", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const later = await context.sample();
    await context.ingest(fixture, [later]);
    const earlier = await context.sample({
      capturedAt: new Date(Date.parse(later.capturedAt) - 1).toISOString(),
    });
    await expect(context.ingest(fixture, [earlier])).resolves.toEqual([
      { clientSampleId: earlier.clientSampleId, status: "ACCEPTED" },
    ]);
    expect(await context.rawSamples(fixture)).toHaveLength(2);
  });
});
