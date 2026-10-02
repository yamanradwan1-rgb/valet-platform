import {
  keySlotConfigurationListSchema,
  keySlotConfigurationSchema,
  parkingSpotListResponseSchema,
  parkingSpotConfigurationSchema,
  parkingZoneSelectorListSchema,
  parkingZoneSelectorSchema,
  physicalResourceLabelSchema,
  type CreateKeySlotRequest,
  type CreateParkingSpotRequest,
  type CreateParkingZoneRequest,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

function base(locationId: string) {
  return `/v1/staff/dashboard/locations/${locationId}/physical-resources`;
}

export function readKeySlots(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(locationId)}/key-slots`,
    keySlotConfigurationListSchema,
    {
      query: { cursor, limit: 50 },
      signal,
    },
  );
}

export function readParkingSpots(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(locationId)}/parking-spots`,
    parkingSpotListResponseSchema,
    {
      query: { cursor, limit: 50 },
      signal,
    },
  );
}

export function readParkingZones(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
  cursor: string | null = null,
) {
  return api.request(
    `${base(locationId)}/parking-zones`,
    parkingZoneSelectorListSchema,
    {
      query: { cursor, limit: 100 },
      signal,
    },
  );
}

export function createParkingZone(
  api: DashboardApiClient,
  locationId: string,
  body: CreateParkingZoneRequest,
) {
  return api.request(
    `${base(locationId)}/parking-zones`,
    parkingZoneSelectorSchema,
    { body, method: "POST" },
  );
}

export function createKeySlot(
  api: DashboardApiClient,
  locationId: string,
  body: CreateKeySlotRequest,
) {
  return api.request(
    `${base(locationId)}/key-slots`,
    keySlotConfigurationSchema,
    {
      body,
      method: "POST",
    },
  );
}

export function createParkingSpot(
  api: DashboardApiClient,
  locationId: string,
  body: CreateParkingSpotRequest,
) {
  return api.request(
    `${base(locationId)}/parking-spots`,
    parkingSpotConfigurationSchema,
    {
      body,
      method: "POST",
    },
  );
}

export function readPhysicalResourceLabel(
  api: DashboardApiClient,
  locationId: string,
  kind: "key-slot" | "parking-spot",
  resourceId: string,
  signal?: AbortSignal,
) {
  const family = kind === "key-slot" ? "key-slots" : "parking-spots";
  return api.request(
    `${base(locationId)}/${family}/${resourceId}/label`,
    physicalResourceLabelSchema,
    { signal },
  );
}
