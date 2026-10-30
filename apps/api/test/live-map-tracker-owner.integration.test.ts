import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LiveMapTestContext,
  expectLiveMapDenied,
} from "./live-map-test-context";

const context = new LiveMapTestContext("tracker_owner_scope");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-007G live tracker owner and scope", () => {
  it("includes the canonical current Task owner and omits a NULL tracker owner", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const missingOwner = await context.addParkingWork(
      fixture,
      new Date(fixture.trackerStartedAt.getTime() + 1_000),
      null,
    );

    const page = await context.liveQuery({
      authenticatedUserId: manager.userId,
      limit: 1,
      locationId: fixture.locationId,
    });
    expect(page.items.map((item) => item.trackingSessionId)).toEqual([
      fixture.trackingSessionId,
    ]);
    expect(page.items[0]!.assigneeMembershipId).toBe(fixture.membershipId);
    expect(page.nextCursor).toBeNull();

    const stored = await context.adminPool.query<{
      assignee_membership_id: string | null;
      current_assignee_membership_id: string;
    }>(
      `SELECT tracker.assignee_membership_id::text,
              task.current_assignee_membership_id::text
       FROM task_tracking_sessions AS tracker
       INNER JOIN tasks AS task ON task.id = tracker.task_id
       WHERE tracker.id = $1`,
      [missingOwner.trackingSessionId],
    );
    expect(stored.rows[0]).toEqual({
      assignee_membership_id: null,
      current_assignee_membership_id: fixture.membershipId,
    });
  });

  it("omits a segment attributed to another same-tenant membership", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const mismatched = await context.addParkingWork(
      fixture,
      new Date(fixture.trackerStartedAt.getTime() + 1_000),
      manager.membershipId,
    );

    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items.map((item) => item.trackingSessionId)).toEqual([
      fixture.trackingSessionId,
    ]);
    expect(result.items).not.toContainEqual(
      expect.objectContaining({
        trackingSessionId: mismatched.trackingSessionId,
      }),
    );
  });

  it("does not mix other-tenant or other-location trackers into the authorized page", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const foreignTenant = await context.createParkingTrackingFixture();
    const otherLocation = await context.createLocation(fixture);
    await context.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, fixture.membershipId, otherLocation],
    );
    const otherLocationWork = await context.addParkingWork(
      { ...fixture, locationId: otherLocation },
      new Date(fixture.trackerStartedAt.getTime() + 1_000),
    );

    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items.map((item) => item.trackingSessionId)).toEqual([
      fixture.trackingSessionId,
    ]);
    expect(result.items.map((item) => item.trackingSessionId)).not.toContain(
      foreignTenant.trackingSessionId,
    );
    expect(result.items.map((item) => item.trackingSessionId)).not.toContain(
      otherLocationWork.trackingSessionId,
    );
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: foreignTenant.locationId,
      }),
    );
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: otherLocation,
      }),
    );
  });
});
