import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LiveMapTestContext } from "./live-map-test-context";

const context = new LiveMapTestContext("areas_privacy");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

async function enableDashboardAccess(organizationId: string) {
  await context.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=TRUE, updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId],
  );
}

describe("VAL-007G current area and privacy projection", () => {
  it("projects all overlapping active current areas in deterministic order", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const manager = await context.manager(fixture);
    const restrictedId = await context.addArea(fixture, {
      code: "B",
      purpose: "RESTRICTED",
    });
    const parkingId = await context.addArea(fixture, {
      code: "A",
      purpose: "PARKING",
    });
    await context.addArea(fixture, {
      active: false,
      code: "C",
      purpose: "STAGING",
    });
    await context.seedSample(fixture, {
      capturedAt: await context.databaseTime(),
    });
    const areas = (
      await context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: fixture.locationId,
      })
    ).items[0]!.position!.areas;
    expect(areas.map((area) => area.mapAreaId)).toEqual([
      parkingId,
      restrictedId,
    ]);
    expect(areas).toEqual([
      expect.objectContaining({
        code: "A",
        label: "Live area",
        levelLabel: "B1",
        purpose: "PARKING",
      }),
      expect.objectContaining({ code: "B", purpose: "RESTRICTED" }),
    ]);
  });

  it("counts polygon edges and vertices as inside and clear outside as outside", async () => {
    for (const [latitude, longitude, expected] of [
      [31, 35.5, 1],
      [31, 35, 1],
      [33, 38, 0],
    ] as const) {
      const fixture = await context.createParkingTrackingFixture();
      await enableDashboardAccess(fixture.organizationId);
      const manager = await context.manager(fixture);
      await context.addArea(fixture);
      await context.seedSample(fixture, {
        capturedAt: await context.databaseTime(),
        latitude,
        longitude,
      });
      const item = (
        await context.liveQuery({
          authenticatedUserId: manager.userId,
          locationId: fixture.locationId,
        })
      ).items[0]!;
      expect(item.position!.areas).toHaveLength(expected);
    }
  });

  it("returns only the approved operational fields and no raw/internal history data", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await enableDashboardAccess(fixture.organizationId);
    const manager = await context.manager(fixture);
    await context.seedSample(fixture, {
      capturedAt: await context.databaseTime(),
    });
    const result = await context.liveQuery({
      authenticatedUserId: manager.userId,
      locationId: fixture.locationId,
    });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(
      /clientSampleId|receivedAt|rawGpsSample|userId|shiftId|vertices|GeofenceEvent|organizationId|locationId/,
    );
    expect(result.items[0]!.position).toEqual({
      areas: [],
      capturedAt: expect.any(String),
      freshness: "LIVE",
      latitude: 31.5,
      longitude: 35.5,
    });
  });

  it("never evaluates active geometry from another tenant or Location", async () => {
    const target = await context.createParkingTrackingFixture();
    const foreign = await context.createParkingTrackingFixture();
    await enableDashboardAccess(target.organizationId);
    const manager = await context.manager(target);
    await context.addArea(foreign);
    await context.seedSample(target, {
      capturedAt: await context.databaseTime(),
    });
    const item = (
      await context.liveQuery({
        authenticatedUserId: manager.userId,
        locationId: target.locationId,
      })
    ).items[0]!;
    expect(item.position!.areas).toEqual([]);
  });
});
