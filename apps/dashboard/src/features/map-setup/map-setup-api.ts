import {
  createLocationMapAreaRequestSchema,
  createLocationMapPointRequestSchema,
  locationMapAreaListResponseSchema,
  locationMapAreaSchema,
  locationMapPointListResponseSchema,
  locationMapPointSchema,
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

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Typed data access for Map Setup (D3-002).
 *
 * Paths below are STAFF-API-CLIENT-RELATIVE: StaffApiClient owns the
 * `/v1/staff` prefix (same-origin Next.js rewrite in the browser, API_ORIGIN
 * server-side) and resolves `${baseUrl}${path}`, so this module supplies
 * prefix-less paths exactly like the auth/overview/live-operations modules.
 *
 * Endpoints re-verified against apps/api/src/modules/map-setup:
 * - GET    /locations/:locationId/map/points
 * - POST   /locations/:locationId/map/points
 * - PATCH  /locations/:locationId/map/points/:pointId
 * - GET    /locations/:locationId/map/areas
 * - POST   /locations/:locationId/map/areas
 * - PATCH  /locations/:locationId/map/areas/:areaId
 * - PUT    /locations/:locationId/map/areas/:areaId/vertices
 *
 * There is deliberately NO delete endpoint: DEC-047 mandates soft
 * activation/deactivation through PATCH (`active`). Area field updates and
 * vertex replacement are separate backend operations and are never combined
 * here. Authorization is server-side per exact Location ID; denials arrive as
 * AUTHORIZATION_DENIED masked to HTTP 404, duplicate codes / concurrent edits
 * as MAP_SETUP_CONFLICT (409).
 */

export type MapSetupClient = Pick<StaffApiClient, "request">;

export interface MapSetupData {
  readonly areas: LocationMapArea[];
  readonly points: LocationMapPoint[];
}

interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

function mapPath(locationId: string, suffix: string): string {
  // Prefix-less on purpose: StaffApiClient already owns the "/v1/staff" base.
  return `/locations/${encodeURIComponent(locationId)}/map/${suffix}`;
}

function entityIdPath(
  locationId: string,
  suffix: string,
  id: string,
): string {
  return `${mapPath(locationId, suffix)}/${encodeURIComponent(id)}`;
}

function parseResponse<TData>(
  schema: ContractSchema<TData>,
  payload: unknown,
  diagnosticCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DashboardApiError({
      code: diagnosticCode,
      kind: "server",
      message: `Map setup response failed contract validation (${diagnosticCode}).`,
      status: 0,
    });
  }
  return result.data;
}

function parseRequest<TData>(
  schema: ContractSchema<TData>,
  request: TData,
): TData {
  const result = schema.safeParse(request);
  if (!result.success) {
    throw new DashboardApiError({
      code: "MAP_SETUP_REQUEST_INVALID",
      kind: "validation",
      message: "Map setup request violated the shared contract.",
      status: 0,
    });
  }
  return result.data;
}

export async function fetchMapPoints(
  client: MapSetupClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<LocationMapPoint[]> {
  const payload = await client.request<unknown>(
    mapPath(locationId, "points"),
    { signal },
  );
  return parseResponse(
    locationMapPointListResponseSchema,
    payload,
    "MAP_SETUP_POINTS_RESPONSE_INVALID",
  ).points;
}

export async function fetchMapAreas(
  client: MapSetupClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<LocationMapArea[]> {
  const payload = await client.request<unknown>(
    mapPath(locationId, "areas"),
    { signal },
  );
  return parseResponse(
    locationMapAreaListResponseSchema,
    payload,
    "MAP_SETUP_AREAS_RESPONSE_INVALID",
  ).areas;
}

export async function loadMapSetup(
  client: MapSetupClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<MapSetupData> {
  const [points, areas] = await Promise.all([
    fetchMapPoints(client, locationId, signal),
    fetchMapAreas(client, locationId, signal),
  ]);
  return { areas, points };
}

export async function createMapPoint(
  client: MapSetupClient,
  locationId: string,
  request: CreateLocationMapPointRequest,
): Promise<LocationMapPoint> {
  const body = parseRequest(createLocationMapPointRequestSchema, request);
  const payload = await client.request<unknown>(
    mapPath(locationId, "points"),
    { body, method: "POST" },
  );
  return parseResponse(
    locationMapPointSchema,
    payload,
    "MAP_SETUP_POINT_RESPONSE_INVALID",
  );
}

export async function updateMapPoint(
  client: MapSetupClient,
  locationId: string,
  pointId: string,
  patch: UpdateLocationMapPointRequest,
): Promise<LocationMapPoint> {
  const body = parseRequest(updateLocationMapPointRequestSchema, patch);
  const payload = await client.request<unknown>(
    entityIdPath(locationId, "points", pointId),
    { body, method: "PATCH" },
  );
  return parseResponse(
    locationMapPointSchema,
    payload,
    "MAP_SETUP_POINT_RESPONSE_INVALID",
  );
}

export async function createMapArea(
  client: MapSetupClient,
  locationId: string,
  request: CreateLocationMapAreaRequest,
): Promise<LocationMapArea> {
  const body = parseRequest(createLocationMapAreaRequestSchema, request);
  const payload = await client.request<unknown>(
    mapPath(locationId, "areas"),
    { body, method: "POST" },
  );
  return parseResponse(
    locationMapAreaSchema,
    payload,
    "MAP_SETUP_AREA_RESPONSE_INVALID",
  );
}

/**
 * Updates area METADATA only. Vertices are never sent through this operation;
 * the backend owns them via the separate vertices replace endpoint.
 */
export async function updateMapArea(
  client: MapSetupClient,
  locationId: string,
  areaId: string,
  patch: UpdateLocationMapAreaRequest,
): Promise<LocationMapArea> {
  const body = parseRequest(updateLocationMapAreaRequestSchema, patch);
  const payload = await client.request<unknown>(
    entityIdPath(locationId, "areas", areaId),
    { body, method: "PATCH" },
  );
  return parseResponse(
    locationMapAreaSchema,
    payload,
    "MAP_SETUP_AREA_RESPONSE_INVALID",
  );
}

/** Full atomic vertex replacement; array order is authoritative verbatim. */
export async function replaceMapAreaVertices(
  client: MapSetupClient,
  locationId: string,
  areaId: string,
  request: ReplaceLocationMapAreaVerticesRequest,
): Promise<LocationMapArea> {
  const body = parseRequest(replaceLocationMapAreaVerticesRequestSchema, request);
  const payload = await client.request<unknown>(
    entityIdPath(locationId, "areas", areaId) + "/vertices",
    { body, method: "PUT" },
  );
  return parseResponse(
    locationMapAreaSchema,
    payload,
    "MAP_SETUP_AREA_RESPONSE_INVALID",
  );
}
