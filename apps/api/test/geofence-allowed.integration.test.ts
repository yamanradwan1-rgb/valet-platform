import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GeofenceTestContext,
  insideA,
  insideB,
  outside,
} from "./geofence-test-context";

const areaB = [
  { latitude: 31, longitude: 36 },
  { latitude: 31, longitude: 37 },
  { latitude: 32, longitude: 37 },
  { latitude: 32, longitude: 36 },
];
const overlapB = [
  { latitude: 31.25, longitude: 35.25 },
  { latitude: 31.25, longitude: 36.25 },
  { latitude: 32.25, longitude: 36.25 },
  { latitude: 32.25, longitude: 35.25 },
];

describe("VAL-007E allowed-union transitions", () => {
  const context = new GeofenceTestContext("allowed");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("appends ENTERED for outside to allowed", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "PARKING");
    await context.ingest(fixture, await context.samples([outside, insideA]));
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
    ]);
  });

  it("appends EXITED and one VIOLATION when leaving allowed union", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "PARKING");
    await context.ingest(fixture, await context.samples([insideA, outside]));
    expect(await context.events(fixture)).toMatchObject([
      { event_type: "ENTERED", map_area_id: areaId },
      { event_type: "EXITED", map_area_id: areaId },
      { event_type: "VIOLATION", map_area_id: areaId },
    ]);
  });

  it("moves between allowed polygons without a union violation", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    await context.addArea(fixture, "STAGING", areaB);
    await context.ingest(fixture, await context.samples([insideA, insideB]));
    expect(
      (await context.events(fixture)).filter(
        (event) => event.event_type === "VIOLATION",
      ),
    ).toHaveLength(0);
  });

  it("uses allowed-union semantics for overlapping polygons", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    await context.addArea(fixture, "OVERFLOW", overlapB);
    const overlap = { latitude: 31.5, longitude: 35.5 };
    const onlySecond = { latitude: 32.1, longitude: 35.5 };
    await context.ingest(fixture, await context.samples([overlap, onlySecond]));
    expect(
      (await context.events(fixture)).filter(
        (event) => event.event_type === "VIOLATION",
      ),
    ).toHaveLength(0);
  });

  it("chooses the lexicographically smallest exited allowed area", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const larger = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const smaller = "00000000-0000-4000-8000-000000000001";
    await context.addArea(fixture, "PARKING", undefined, { id: larger });
    await context.addArea(fixture, "OVERFLOW", undefined, { id: smaller });
    await context.ingest(fixture, await context.samples([insideA, outside]));
    const violations = (await context.events(fixture)).filter(
      (event) => event.event_type === "VIOLATION",
    );
    expect(violations).toMatchObject([{ map_area_id: smaller }]);
  });

  it("does not spam outside and can violate after re-entry", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    await context.ingest(
      fixture,
      await context.samples([insideA, outside, outside, insideA, outside]),
    );
    expect(
      (await context.events(fixture)).filter(
        (event) => event.event_type === "VIOLATION",
      ),
    ).toHaveLength(2);
  });

  it("processes multiple advancing samples in captured-time order", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    const samples = await context.samples([outside, insideA, outside]);
    await context.ingest(fixture, samples);
    expect(
      (await context.events(fixture)).map((event) => ({
        at: event.occurred_at.toISOString(),
        type: event.event_type,
      })),
    ).toEqual([
      { at: samples[1]!.capturedAt, type: "ENTERED" },
      { at: samples[2]!.capturedAt, type: "EXITED" },
      { at: samples[2]!.capturedAt, type: "VIOLATION" },
    ]);
  });
});
