import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GeofenceTestContext, insideA, outside } from "./geofence-test-context";

describe("VAL-007E alert-only and privacy boundary", () => {
  const context = new GeofenceTestContext("state_privacy");

  beforeAll(async () => await context.setup(), 120_000);
  afterAll(async () => await context.teardown(), 120_000);

  it("does not mutate business state or create adjacent history", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "PARKING");
    await context.addArea(fixture, "RESTRICTED");
    const before = await context.protectedState(fixture);
    await context.ingest(fixture, await context.samples([insideA, outside]));
    const after = await context.protectedState(fixture);
    expect(after).toEqual(before);
    expect((await context.events(fixture)).length).toBeGreaterThan(0);
  });

  it("stores exact scope and timestamps without raw coordinates", async () => {
    const fixture = await context.createParkingTrackingFixture();
    const areaId = await context.addArea(fixture, "RESTRICTED");
    const [sample] = await context.samples([insideA]);
    await context.ingest(fixture, [sample!]);
    const columns = await context.adminPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'geofence_events'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining(["latitude", "longitude"]),
    );
    const rows = await context.adminPool.query<{
      location_id: string;
      map_area_id: string;
      organization_id: string;
      task_id: string;
      tracking_session_id: string;
      valet_session_id: string;
    }>(
      `SELECT organization_id::text, location_id::text,
              valet_session_id::text, task_id::text,
              tracking_session_id::text, map_area_id::text
       FROM geofence_events WHERE tracking_session_id = $1`,
      [fixture.trackingSessionId],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        {
          location_id: fixture.locationId,
          map_area_id: areaId,
          organization_id: fixture.organizationId,
          task_id: fixture.movementTaskId,
          tracking_session_id: fixture.trackingSessionId,
          valet_session_id: fixture.sessionId,
        },
      ]),
    );
  });

  it("does not copy coordinates into AuditEvent metadata", async () => {
    const fixture = await context.createParkingTrackingFixture();
    await context.addArea(fixture, "RESTRICTED");
    const before = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events
       WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    await context.ingest(fixture, await context.samples([insideA]));
    const after = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events
       WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
