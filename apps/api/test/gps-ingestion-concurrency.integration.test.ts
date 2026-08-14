import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GpsIngestionTestContext } from "./gps-ingestion-test-context";

describe("VAL-007D GPS movement-end coordination", () => {
  const context = new GpsIngestionTestContext("concurrency");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  async function trackerOutcome(trackingSessionId: string) {
    const result = await context.adminPool.query<{
      ended_at: Date;
      sample_count: number;
    }>(
      `SELECT tracker.ended_at,
              count(sample.id)::integer AS sample_count
       FROM task_tracking_sessions AS tracker
       LEFT JOIN raw_gps_samples AS sample
         ON sample.tracking_session_id = tracker.id
       WHERE tracker.id = $1
       GROUP BY tracker.id, tracker.ended_at`,
      [trackingSessionId],
    );
    expect(result.rows[0]?.ended_at).toBeInstanceOf(Date);
    return result.rows[0]!;
  }

  it("serializes ingestion with confirm-parked", async () => {
    const fixture = await context.createParkingCompletionFixture();
    const sample = await context.sample();
    const completionOrder: string[] = [];
    const [ingestion, completion] = await Promise.allSettled([
      context.ingest(fixture.tracking, [sample]).then((result) => {
        completionOrder.push("ingestion");
        return result;
      }),
      context.confirm(fixture.source).then((result) => {
        completionOrder.push("movement-end");
        return result;
      }),
    ]);
    expect(completion.status).toBe("fulfilled");
    if (ingestion.status === "rejected") {
      expect(ingestion.reason).toMatchObject({
        code: expect.stringMatching(/TASK_/),
      });
    }
    const outcome = await trackerOutcome(fixture.tracking.trackingSessionId);
    expect(outcome.sample_count).toBe(ingestion.status === "fulfilled" ? 1 : 0);
    if (ingestion.status === "fulfilled") {
      expect(completionOrder).toEqual(["ingestion", "movement-end"]);
    }
  });

  it("serializes ingestion with mark-ready", async () => {
    const fixture = await context.createRetrievalTrackingFixture();
    const sample = await context.sample();
    const completionOrder: string[] = [];
    const [ingestion, completion] = await Promise.allSettled([
      context.ingest(fixture, [sample]).then((result) => {
        completionOrder.push("ingestion");
        return result;
      }),
      context.markReady(fixture.source).then((result) => {
        completionOrder.push("movement-end");
        return result;
      }),
    ]);
    expect(completion.status).toBe("fulfilled");
    if (ingestion.status === "rejected") {
      expect(ingestion.reason).toMatchObject({
        code: expect.stringMatching(/TASK_/),
      });
    }
    const outcome = await trackerOutcome(fixture.trackingSessionId);
    expect(outcome.sample_count).toBe(ingestion.status === "fulfilled" ? 1 : 0);
    if (ingestion.status === "fulfilled") {
      expect(completionOrder).toEqual(["ingestion", "movement-end"]);
    }
  });
});
