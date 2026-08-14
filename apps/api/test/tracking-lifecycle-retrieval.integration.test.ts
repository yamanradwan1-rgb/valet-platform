import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  expectMarkReadyError,
  MarkReadyTestContext,
} from "./mark-ready-test-context";

const context = new MarkReadyTestContext("007c_tracking_retrieval");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function setTracking(
  organizationId: string,
  locationId: string,
  enabled: boolean,
) {
  await context.adminPool.query(
    `UPDATE organizations SET tracking_enabled = $2 WHERE id = $1`,
    [organizationId, enabled],
  );
  await context.adminPool.query(
    `UPDATE locations SET tracking_enabled_override = NULL
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, locationId],
  );
}

async function activeTracker(sessionId: string) {
  return (
    await context.adminPool.query<{
      ended_at: Date | null;
      started_at: Date;
      task_id: string;
    }>(
      `SELECT task_id::text, started_at, ended_at
       FROM task_tracking_sessions
       WHERE valet_session_id = $1 AND ended_at IS NULL`,
      [sessionId],
    )
  ).rows[0];
}

describe("VAL-007C Retrieval tracking lifecycle", () => {
  it("creates and atomically ends the exact Retrieval tracker", async () => {
    const fixture = await context.createStartRetrievalFixture();
    await setTracking(fixture.organizationId, fixture.locationId, true);
    const started = await context.startRetrieval(fixture);
    expect(await activeTracker(fixture.sessionId)).toEqual({
      ended_at: null,
      started_at: new Date(started.retrievalStartedAt),
      task_id: fixture.retrievalTaskId,
    });
    await setTracking(fixture.organizationId, fixture.locationId, false);
    const ready = await context.markReady(fixture);
    const row = await context.adminPool.query<{
      ended_at: Date;
      started_at: Date;
      task_id: string;
    }>(
      `SELECT task_id::text, started_at, ended_at
       FROM task_tracking_sessions
       WHERE valet_session_id = $1 AND task_id = $2`,
      [fixture.sessionId, fixture.retrievalTaskId],
    );
    expect(row.rows).toEqual([
      {
        ended_at: new Date(ready.readyAt),
        started_at: new Date(started.retrievalStartedAt),
        task_id: fixture.retrievalTaskId,
      },
    ]);
  });

  it("keeps policy-OFF Retrieval free of tracking rows", async () => {
    const fixture = await context.createMarkReadyFixture();
    const result = await context.markReady(fixture);
    expect(result.state).toBe("READY");
    const count = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM task_tracking_sessions
       WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(count.rows[0]?.count).toBe(0);
  });

  it("rolls back READY when the active tracker belongs to another Task", async () => {
    const fixture = await context.createMarkReadyFixture();
    await context.adminPool.query(
      `INSERT INTO task_tracking_sessions
         (id, organization_id, location_id, valet_session_id, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        fixture.sessionId,
        fixture.taskId,
      ],
    );
    await expectMarkReadyError(
      context.markReady(fixture),
      "TASK_INVALID_STATE",
    );
    const effects = await context.readyEffects(fixture);
    expect(effects.projection).toMatchObject({
      ready_at: null,
      session_state: "RETRIEVING",
      session_version: 6,
    });
    expect(effects.counts.ready_audit_count).toBe(0);
    expect((await activeTracker(fixture.sessionId))?.task_id).toBe(
      fixture.taskId,
    );
  });

  it("creates no GPS sample or geofence event", async () => {
    const fixture = await context.createStartRetrievalFixture();
    await setTracking(fixture.organizationId, fixture.locationId, true);
    await context.startRetrieval(fixture);
    const counts = await context.adminPool.query<{
      geofence_count: number;
      sample_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM raw_gps_samples
          WHERE valet_session_id = $1) AS sample_count,
         (SELECT count(*)::integer FROM geofence_events
          WHERE valet_session_id = $1) AS geofence_count`,
      [fixture.sessionId],
    );
    expect(counts.rows[0]).toEqual({ geofence_count: 0, sample_count: 0 });
  });
});
