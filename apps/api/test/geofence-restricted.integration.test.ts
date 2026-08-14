import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GeofenceTestContext, insideA, outside } from "./geofence-test-context";

describe("VAL-007E restricted-area transitions", () => {
  const context = new GeofenceTestContext("restricted");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("appends ENTERED and VIOLATION on restricted entry", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "RESTRICTED");
    await context.ingest(fixture, await context.samples([outside, insideA]));
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
      { event_type: "VIOLATION", map_area_id: areaId },
    ]);
  });

  it("does not repeat a violation while remaining restricted", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "RESTRICTED");
    await context.ingest(
      fixture,
      await context.samples([
        outside,
        insideA,
        { latitude: 31.6, longitude: 35.6 },
      ]),
    );
    expect(
      (await context.events(fixture)).filter(
        (event) => event.event_type === "VIOLATION",
      ),
    ).toHaveLength(1);
  });

  it("appends EXITED and permits a later re-entry violation", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "RESTRICTED");
    await context.ingest(
      fixture,
      await context.samples([insideA, outside, insideA]),
    );
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
      { event_type: "VIOLATION", map_area_id: areaId },
      { event_type: "EXITED", map_area_id: areaId },
      { event_type: "ENTERED", map_area_id: areaId },
      { event_type: "VIOLATION", map_area_id: areaId },
    ]);
  });

  it("still violates restricted entry inside an allowed overlap", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const restrictedId = await context.addArea(fixture, "RESTRICTED");
    await context.ingest(fixture, await context.samples([outside, insideA]));
    const violations = (await context.events(fixture)).filter(
      (event) => event.event_type === "VIOLATION",
    );
    expect(violations).toMatchObject([{ map_area_id: restrictedId }]);
  });
});
