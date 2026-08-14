import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GeofenceTestContext, insideA, outside } from "./geofence-test-context";

describe("VAL-007E baseline and area scope", () => {
  const context = new GeofenceTestContext("baseline");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("establishes an allowed baseline with ENTERED only", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "PARKING");
    await context.ingest(fixture, await context.samples([insideA]));
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
    ]);
  });

  it("establishes an outside baseline without synthetic events", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    await context.ingest(fixture, await context.samples([outside]));
    expect(await context.events(fixture)).toEqual([]);
  });

  it("establishes a restricted baseline with ENTERED and VIOLATION", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "RESTRICTED");
    const [sample] = await context.samples([insideA]);
    await context.ingest(fixture, [sample!]);
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
      { event_type: "VIOLATION", map_area_id: areaId },
    ]);
    for (const event of await context.events(fixture)) {
      expect(event.occurred_at.toISOString()).toBe(sample!.capturedAt);
      expect(event.recorded_at).toBeInstanceOf(Date);
    }
  });

  it("ignores inactive areas", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "RESTRICTED", undefined, { active: false });
    await context.ingest(fixture, await context.samples([insideA]));
    expect(await context.events(fixture)).toEqual([]);
  });

  it("never evaluates foreign-tenant or wrong-Location areas", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const foreign = await context.createParkingTrackingFixture();
    await context.addArea(foreign, "RESTRICTED");

    const otherLocationId = await context.addLocation(fixture);
    await context.addArea(
      { ...fixture, locationId: otherLocationId },
      "RESTRICTED",
    );

    await context.ingest(fixture, await context.samples([insideA]));
    expect(await context.events(fixture)).toEqual([]);
  });
});
