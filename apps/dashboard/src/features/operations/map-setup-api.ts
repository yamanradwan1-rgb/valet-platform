import {
  createLocationMapAreaRequestSchema,
  createLocationMapPointRequestSchema,
  locationMapAreaListResponseSchema,
  locationMapAreaSchema,
  locationMapPointListResponseSchema,
  locationMapPointSchema,
  parkingZoneSelectorListSchema,
  replaceLocationMapAreaVerticesRequestSchema,
  updateLocationMapAreaRequestSchema,
  updateLocationMapPointRequestSchema,
  type CreateLocationMapAreaRequest,
  type CreateLocationMapPointRequest,
  type LocationMapArea,
  type LocationMapPoint,
  type ReplaceLocationMapAreaVerticesRequest,
  type UpdateLocationMapAreaRequest,
  type UpdateLocationMapPointRequest,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

const base = (locationId: string) =>
  `/v1/staff/locations/${encodeURIComponent(locationId)}/map`;

export async function readMapPoints(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<readonly LocationMapPoint[]> {
  const response = await api.request(`${base(locationId)}/points`, locationMapPointListResponseSchema, {
    method: "GET", signal,
  });
  return response.points;
}

export async function readMapAreas(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<readonly LocationMapArea[]> {
  const response = await api.request(`${base(locationId)}/areas`, locationMapAreaListResponseSchema, {
    method: "GET", signal,
  });
  return response.areas;
}

export function readMapParkingZones(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(locationId)}/parking-zones`,
    parkingZoneSelectorListSchema,
    { method: "GET", query: { cursor, limit: 50 }, signal },
  );
}

export function createMapPoint(
  api: DashboardApiClient,
  locationId: string,
  input: CreateLocationMapPointRequest,
): Promise<LocationMapPoint> {
  const body = createLocationMapPointRequestSchema.parse(input);
  return api.request(`${base(locationId)}/points`, locationMapPointSchema, {
    method: "POST", body,
  });
}

export function updateMapPoint(
  api: DashboardApiClient,
  locationId: string,
  pointId: string,
  input: UpdateLocationMapPointRequest,
): Promise<LocationMapPoint> {
  const body = updateLocationMapPointRequestSchema.parse(input);
  return api.request(
    `${base(locationId)}/points/${encodeURIComponent(pointId)}`,
    locationMapPointSchema,
    { method: "PATCH", body },
  );
}

export function createMapArea(
  api: DashboardApiClient,
  locationId: string,
  input: CreateLocationMapAreaRequest,
): Promise<LocationMapArea> {
  const body = createLocationMapAreaRequestSchema.parse(input);
  return api.request(`${base(locationId)}/areas`, locationMapAreaSchema, {
    method: "POST", body,
  });
}

export function updateMapArea(
  api: DashboardApiClient,
  locationId: string,
  areaId: string,
  input: UpdateLocationMapAreaRequest,
): Promise<LocationMapArea> {
  const body = updateLocationMapAreaRequestSchema.parse(input);
  return api.request(
    `${base(locationId)}/areas/${encodeURIComponent(areaId)}`,
    locationMapAreaSchema,
    { method: "PATCH", body },
  );
}

export function replaceMapAreaVertices(
  api: DashboardApiClient,
  locationId: string,
  areaId: string,
  input: ReplaceLocationMapAreaVerticesRequest,
): Promise<LocationMapArea> {
  const body = replaceLocationMapAreaVerticesRequestSchema.parse(input);
  return api.request(
    `${base(locationId)}/areas/${encodeURIComponent(areaId)}/vertices`,
    locationMapAreaSchema,
    { method: "PUT", body },
  );
}
