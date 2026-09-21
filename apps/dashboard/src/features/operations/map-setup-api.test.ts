import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  createMapArea, createMapPoint, readMapAreas, readMapPoints,
  replaceMapAreaVertices, updateMapArea, updateMapPoint,
} from "./map-setup-api";

const locationId = "22222222-2222-4222-8222-222222222222";
const pointId = "33333333-3333-4333-8333-333333333333";
const areaId = "44444444-4444-4444-8444-444444444444";
const point = {
  active: true, code: "ENT", kind: "ENTRANCE" as const, label: "Entrance",
  latitude: 31.95, levelLabel: null, longitude: 35.91,
};
const area = {
  active: true, code: "P1", label: "Parking", levelLabel: null, parkingZoneId: null,
  purpose: "PARKING" as const,
  vertices: [
    { latitude: 31.95, longitude: 35.91 },
    { latitude: 31.951, longitude: 35.91 },
    { latitude: 31.951, longitude: 35.911 },
  ],
};

function api() {
  const request = vi.fn().mockResolvedValue({ points: [], areas: [] });
  return { client: { request } as unknown as DashboardApiClient, request };
}

describe("LM map setup API", () => {
  it("owns only the accepted point/area GET and mutation routes", async () => {
    const { client, request } = api();
    await readMapPoints(client, locationId);
    await createMapPoint(client, locationId, point);
    await updateMapPoint(client, locationId, pointId, { label: "Entry" });
    await readMapAreas(client, locationId);
    await createMapArea(client, locationId, area);
    await updateMapArea(client, locationId, areaId, { label: "Lot" });
    await replaceMapAreaVertices(client, locationId, areaId, { vertices: area.vertices });
    expect(request.mock.calls.map((call) => [call[0], call[2]?.method])).toEqual([
      [`/v1/staff/locations/${locationId}/map/points`, "GET"],
      [`/v1/staff/locations/${locationId}/map/points`, "POST"],
      [`/v1/staff/locations/${locationId}/map/points/${pointId}`, "PATCH"],
      [`/v1/staff/locations/${locationId}/map/areas`, "GET"],
      [`/v1/staff/locations/${locationId}/map/areas`, "POST"],
      [`/v1/staff/locations/${locationId}/map/areas/${areaId}`, "PATCH"],
      [`/v1/staff/locations/${locationId}/map/areas/${areaId}/vertices`, "PUT"],
    ]);
  });

  it("rejects invalid coordinates and too few vertices before any write", async () => {
    const { client, request } = api();
    expect(() => createMapPoint(client, locationId, { ...point, latitude: 91 })).toThrow();
    expect(() => createMapArea(client, locationId, {
      ...area, vertices: area.vertices.slice(0, 2),
    })).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
