import {
  physicalResourceOverviewResponseSchema,
  physicalResourceCustodyResponseSchema,
  type PhysicalResourceOverviewResponse,
  type PhysicalResourceOverviewQuery,
  type PhysicalResourceCustodyResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

// The authenticated, strictly parsed W3 transport contract owns all source
// semantics. Never calculate whole-location counts from paginated pages.
export type InspectorOverview = PhysicalResourceOverviewResponse;
export type InspectorCustody = PhysicalResourceCustodyResponse;
export type InspectorFamily = "keys" | "spots";
export type InspectorFilter = NonNullable<PhysicalResourceOverviewQuery["keyFilter"]>;
export type InspectorResource = {
  readonly id: string;
  readonly family: InspectorFamily;
  readonly code: string;
  readonly label: string | null;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly usage: "AVAILABLE" | "IN_USE" | "OCCUPIED" | "UNKNOWN";
  readonly vehicle: {
    readonly plateNumberNormalized: string | null;
    readonly temporaryDescriptor: string | null;
  } | null;
  readonly zone: { readonly code: string; readonly label: string } | null;
};

export function inspectorRows(
  data: InspectorOverview,
  family: InspectorFamily,
): readonly InspectorResource[] {
  if (family === "keys") {
    return data.keySlots.items.map((item) => ({
      id: item.keySlotId,
      family,
      code: item.code,
      label: item.label,
      status: item.status,
      usage: item.usage,
      vehicle: item.holdingVehicle,
      zone: null,
    }));
  }
  return data.parkingSpots.items.map((item) => ({
    id: item.parkingSpotId,
    family,
    code: item.code,
    label: item.label,
    status: item.status,
    usage: item.usage,
    vehicle: item.occupancy?.vehicle ?? null,
    zone: item.parkingZone ? {
      code: item.parkingZone.code,
      label: item.parkingZone.label,
    } : null,
  }));
}

export function readResourceInspectorOverview(
  api: DashboardApiClient,
  locationId: string,
  keyCursor: string | null,
  spotCursor: string | null,
  keyFilter: InspectorFilter,
  spotFilter: InspectorFilter,
  signal: AbortSignal,
): Promise<InspectorOverview> {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/physical-resources/overview`,
    physicalResourceOverviewResponseSchema,
    {
      method: "GET",
      signal,
      query: {
        limit: 50,
        keyFilter,
        spotFilter,
        ...(keyCursor ? { keyCursor } : {}),
        ...(spotCursor ? { spotCursor } : {}),
      },
    },
  );
}

export function readResourceInspectorCustody(
  api: DashboardApiClient,
  locationId: string,
  keySlotId: string,
  signal: AbortSignal,
): Promise<InspectorCustody> {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/physical-resources/key-slots/${encodeURIComponent(keySlotId)}/custody`,
    physicalResourceCustodyResponseSchema,
    { method: "GET", signal, query: { limit: 20 } },
  );
}
