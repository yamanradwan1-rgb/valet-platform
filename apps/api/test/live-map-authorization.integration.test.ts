import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  expectLiveMapDenied,
  LiveMapTestContext,
} from "./live-map-test-context";

const context = new LiveMapTestContext("authorization");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-007G live map authorization and policy", () => {
  it("allows an exact-location manager without a Shift", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      assigneeMembershipId: fixture.membershipId,
      taskId: fixture.movementTaskId,
      trackingSessionId: fixture.trackingSessionId,
      valetSessionId: fixture.sessionId,
    });
  });

  it("allows only a shifted exact-location supervisor", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const shifted = await context.supervisor(fixture);
    const unshifted = await context.supervisor(fixture, false);
    expect(
      (
        await context.liveQuery({
          authenticatedUserId: shifted.userId,
          locationId: fixture.locationId,
        })
      ).items,
    ).toHaveLength(1);
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: unshifted.userId,
        locationId: fixture.locationId,
      }),
    );
    await context.adminPool.query(
      `UPDATE shifts SET status = 'ENDED' WHERE membership_id = $1`,
      [shifted.membershipId],
    );
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: shifted.userId,
        locationId: fixture.locationId,
      }),
    );
  });

  it("denies wrong roles, missing access, inactive authority, and foreign scope uniformly", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const employee = await context.actor(fixture, "VALET_EMPLOYEE");
    const admin = await context.actor(fixture, "ORG_ADMIN");
    const noAccess = await context.createActor(fixture, "LOCATION_MANAGER", {
      access: false,
    });
    for (const userId of [
      employee.userId,
      admin.userId,
      noAccess.userId,
      randomUUID(),
    ]) {
      await expectLiveMapDenied(
        context.liveQuery({
          authenticatedUserId: userId,
          locationId: fixture.locationId,
        }),
      );
    }
    const manager = await context.manager(fixture);
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: randomUUID(),
      }),
    );
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1`,
      [manager.membershipId],
    );
    await expectLiveMapDenied(
      context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: fixture.locationId,
      }),
    );
  });

  it("returns an empty authorized page while effective tracking policy is off", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const manager = await context.manager(fixture);
    await context.setPolicy(fixture, false);
    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(Number.isFinite(Date.parse(result.observedAt))).toBe(true);
    await context.adminPool.query(
      `UPDATE organizations SET tracking_enabled = false WHERE id = $1`,
      [fixture.organizationId],
    );
    await context.setPolicy(fixture, true);
    expect(
      (
        await context.liveQuery({
          authenticatedUserId: manager.userId,
          locationId: fixture.locationId,
        })
      ).items,
    ).toHaveLength(1);
  });

  it.each(["user", "organization", "location"] as const)(
    "rejects an inactive %s through the same unavailable boundary",
    async (authority) => {
      const fixture = await context.createParkingTrackingFixture();
      const manager = await context.manager(fixture);
      if (authority === "user") {
        await context.adminPool.query(
          `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
          [manager.userId],
        );
      } else if (authority === "organization") {
        await context.adminPool.query(
          `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
          [fixture.organizationId],
        );
      } else {
        await context.adminPool.query(
          `UPDATE locations SET status = 'INACTIVE' WHERE id = $1`,
          [fixture.locationId],
        );
      }
      await expectLiveMapDenied(
        context.liveQuery({
          authenticatedUserId: manager.userId,
          locationId: fixture.locationId,
        }),
      );
    },
  );
});
