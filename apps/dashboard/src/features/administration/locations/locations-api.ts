import {
  managementLocationLifecycleResponseSchema,
  managementLocationsResponseSchema,
  managementLocationTimezoneCorrectionResponseSchema,
  type ManagementLocationCreateRequest,
  type ManagementLocationCurrencyCorrectionRequest,
  type ManagementLocationLifecycleCommand,
  type ManagementLocationTimezoneCorrectionRequest,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

function base(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/locations`;
}

export function readLocations(
  api: DashboardApiClient,
  organizationId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(base(organizationId), managementLocationsResponseSchema, {
    query: { limit: 50, cursor }, signal,
  });
}

export function createLocation(
  api: DashboardApiClient,
  organizationId: string,
  body: ManagementLocationCreateRequest,
) {
  return api.request(base(organizationId), managementLocationLifecycleResponseSchema, {
    body, method: "POST",
  });
}

export function readLocationLifecycle(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  signal?: AbortSignal,
) {
  return api.request(`${base(organizationId)}/${locationId}/lifecycle`, managementLocationLifecycleResponseSchema, { signal });
}

export function commandLocationLifecycle(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  action: "activate" | "stop-intake" | "resume-intake" | "deactivate",
  expectedUpdatedAt: string,
) {
  const body: ManagementLocationLifecycleCommand = { expectedUpdatedAt };
  return api.request(`${base(organizationId)}/${locationId}/${action}`, managementLocationLifecycleResponseSchema, {
    body, method: "POST",
  });
}

export function correctLocationCurrency(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  body: ManagementLocationCurrencyCorrectionRequest,
) {
  return api.request(`${base(organizationId)}/${locationId}/currency-correction`, managementLocationLifecycleResponseSchema, {
    body, method: "POST",
  });
}

export function correctLocationTimezone(
  api: DashboardApiClient,
  organizationId: string,
  locationId: string,
  body: ManagementLocationTimezoneCorrectionRequest,
) {
  return api.request(
    `${base(organizationId)}/${locationId}/timezone-correction`,
    managementLocationTimezoneCorrectionResponseSchema,
    { body, method: "POST" },
  );
}
