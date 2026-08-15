import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("pagination");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-007G tracker tuple pagination", () => {
  it("uses started_at/id keyset pagination without duplicates or omissions", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const timestamp = new Date(fixture.trackerStartedAt.getTime() + 1_000);
    await context.addParkingWork(fixture, timestamp);
    await context.addParkingWork(fixture, timestamp);

    const first = await context.liveQuery({
      authenticatedUserId: manager.userId,
      limit: 2,
      locationId: fixture.locationId,
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await context.liveQuery({
      authenticatedUserId: manager.userId,
      cursor: first.nextCursor!,
      limit: 2,
      locationId: fixture.locationId,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map(
      (item) => item.trackingSessionId,
    );
    expect(new Set(ids).size).toBe(3);
    const expected = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM task_tracking_sessions
       WHERE organization_id = $1 AND location_id = $2 AND ended_at IS NULL
       ORDER BY started_at, id`,
      [fixture.organizationId, fixture.locationId],
    );
    expect(ids).toEqual(expected.rows.map((row) => row.id));
  });

  it("rejects malformed cursors and reauthorizes every page", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    expect(() =>
      context.liveQuery({
        authenticatedUserId: manager.userId,
        cursor: "broken",
        locationId: fixture.locationId,
      }),
    ).toThrow();
    const page = await context.liveQuery({
      authenticatedUserId: manager.userId,
      limit: 1,
      locationId: fixture.locationId,
    });
    await context.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id = $1 AND location_id = $2`,
      [manager.membershipId, fixture.locationId],
    );
    await expect(
      context.liveQuery({
        authenticatedUserId: manager.userId,
        ...(page.nextCursor === null ? {} : { cursor: page.nextCursor }),
        locationId: fixture.locationId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("omits a tracker ended after page one despite retained GPS", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const startedAt = new Date(fixture.trackerStartedAt.getTime() + 1_000);
    const work = [
      await context.addParkingWork(fixture, startedAt),
      await context.addParkingWork(fixture, startedAt),
    ];
    const first = await context.liveQuery({
      authenticatedUserId: manager.userId,
      limit: 1,
      locationId: fixture.locationId,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();

    const orderedAfterCursor = await context.adminPool.query<{ id: string }>(
      `SELECT id::text FROM task_tracking_sessions
       WHERE organization_id = $1 AND location_id = $2 AND ended_at IS NULL
         AND (started_at, id) > ($3, $4)
       ORDER BY started_at, id`,
      [
        fixture.organizationId,
        fixture.locationId,
        fixture.trackerStartedAt,
        fixture.trackingSessionId,
      ],
    );
    const endedId = orderedAfterCursor.rows[0]!.id;
    const endedWork = work.find(
      (candidate) => candidate.trackingSessionId === endedId,
    )!;
    await context.seedSampleWithDatabaseOffset(
      {
        ...fixture,
        movementTaskId: endedWork.taskId,
        sessionId: endedWork.sessionId,
        trackingSessionId: endedWork.trackingSessionId,
      },
      { offsetMilliseconds: -61_000 },
    );
    await context.adminPool.query(
      `UPDATE task_tracking_sessions SET ended_at = started_at + interval '1 millisecond'
       WHERE id = $1`,
      [endedId],
    );

    const second = await context.liveQuery({
      authenticatedUserId: manager.userId,
      cursor: first.nextCursor!,
      limit: 10,
      locationId: fixture.locationId,
    });
    expect(second.items.map((item) => item.trackingSessionId)).not.toContain(
      endedId,
    );
    const combined = [...first.items, ...second.items].map(
      (item) => item.trackingSessionId,
    );
    expect(new Set(combined).size).toBe(combined.length);
    const retained = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM raw_gps_samples
       WHERE tracking_session_id = $1`,
      [endedId],
    );
    expect(retained.rows[0]!.count).toBe(1);
  });
});
