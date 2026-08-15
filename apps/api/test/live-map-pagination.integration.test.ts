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
});
