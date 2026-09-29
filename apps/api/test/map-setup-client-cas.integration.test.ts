import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MapSetupTestContext,
  validArea,
  validPoint,
} from "./map-setup-test-context";

const context = new MapSetupTestContext("map-client-cas");
const pointPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areaPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("Issue #231 browser Map Setup CAS", () => {
  it("keeps the newer Point when an older browser token submits later", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    const pointId = String(created.body.id);
    const versionX = String(created.body.updatedAt);

    const newer = await context.request(
      "PATCH",
      `${pointPath(actor.fixture.locationId)}/${pointId}`,
      {
        body: { expectedUpdatedAt: versionX, label: "Browser B entrance" },
        token: actor.token,
      },
    );
    expect(newer.status).toBe(200);

    const stale = await context.request(
      "PATCH",
      `${pointPath(actor.fixture.locationId)}/${pointId}`,
      {
        body: { active: false, expectedUpdatedAt: versionX },
        token: actor.token,
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "MAP_SETUP_CONFLICT" });

    const listed = await context.request(
      "GET",
      pointPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(listed.body.points).toEqual([
      expect.objectContaining({
        active: true,
        label: "Browser B entrance",
        updatedAt: newer.body.updatedAt,
      }),
    ]);
    expect((await context.audit(pointId)).rows).toHaveLength(2);
  });

  it("keeps newer Area metadata and ParkingZone association after stale PATCH", async () => {
    const actor = await context.actor();
    const firstZoneId = await context.parkingZone(actor.fixture);
    const secondZoneId = await context.parkingZone(actor.fixture);
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      {
        body: { ...validArea, parkingZoneId: firstZoneId },
        token: actor.token,
      },
    );
    const areaId = String(created.body.id);
    const versionX = String(created.body.updatedAt);

    const newer = await context.request(
      "PATCH",
      `${areaPath(actor.fixture.locationId)}/${areaId}`,
      {
        body: {
          expectedUpdatedAt: versionX,
          label: "Browser B area",
          parkingZoneId: secondZoneId,
        },
        token: actor.token,
      },
    );
    expect(newer.status).toBe(200);

    const stale = await context.request(
      "PATCH",
      `${areaPath(actor.fixture.locationId)}/${areaId}`,
      {
        body: {
          expectedUpdatedAt: versionX,
          label: "Browser A stale area",
          parkingZoneId: null,
        },
        token: actor.token,
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "MAP_SETUP_CONFLICT" });

    const listed = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    expect(listed.body.areas).toEqual([
      expect.objectContaining({
        label: "Browser B area",
        parkingZoneId: secondZoneId,
        updatedAt: newer.body.updatedAt,
      }),
    ]);
    expect((await context.audit(areaId)).rows).toHaveLength(2);
  });

  it("rejects stale polygon replacement before any partial geometry or audit", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: validArea, token: actor.token },
    );
    const areaId = String(created.body.id);
    const versionX = String(created.body.updatedAt);
    const polygonB = [
      { latitude: 10, longitude: 20 },
      { latitude: 11, longitude: 21 },
      { latitude: 12, longitude: 22 },
    ];
    const polygonA = [
      { latitude: 40, longitude: 50 },
      { latitude: 41, longitude: 51 },
      { latitude: 42, longitude: 52 },
    ];

    const newer = await context.request(
      "PUT",
      `${areaPath(actor.fixture.locationId)}/${areaId}/vertices`,
      {
        body: { expectedUpdatedAt: versionX, vertices: polygonB },
        token: actor.token,
      },
    );
    expect(newer.status).toBe(200);

    const stale = await context.request(
      "PUT",
      `${areaPath(actor.fixture.locationId)}/${areaId}/vertices`,
      {
        body: { expectedUpdatedAt: versionX, vertices: polygonA },
        token: actor.token,
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "MAP_SETUP_CONFLICT" });

    const listed = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    const area = (listed.body.areas as Array<Record<string, unknown>>)[0];
    expect(area?.updatedAt).toBe(newer.body.updatedAt);
    expect(area?.vertices).toEqual(
      polygonB.map((vertex, position) => ({ ...vertex, position })),
    );
    const audit = await context.audit(areaId);
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1]?.metadata_json).toEqual({
      active: true,
      configurationType: "PARKING",
      operation: "AREA_VERTICES_REPLACED",
      parkingZoneLinked: false,
      resourceId: areaId,
      resourceType: "LocationMapArea",
    });
  });

  it("does not let a valid token bypass exact Location authorization", async () => {
    const actor = await context.actor();
    const otherLocationId = await context.database.addLocation(actor.fixture);
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    const denied = await context.request(
      "PATCH",
      `${pointPath(otherLocationId)}/${String(created.body.id)}`,
      {
        body: {
          expectedUpdatedAt: created.body.updatedAt,
          label: "Wrong location",
        },
        token: actor.token,
      },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
