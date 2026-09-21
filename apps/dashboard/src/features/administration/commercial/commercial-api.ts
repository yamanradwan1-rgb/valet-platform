import {
  locationSubscriptionResponseSchema,
  managementIntegrationsResponseSchema,
  managementSubscriptionResponseSchema,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

export function readCompanySubscription(api: DashboardApiClient, organizationId: string, signal?: AbortSignal) {
  return api.request(`/v1/staff/management/organizations/${organizationId}/subscription`, managementSubscriptionResponseSchema, { signal });
}
export function readLocationSubscription(api: DashboardApiClient, locationId: string, signal?: AbortSignal) {
  return api.request(`/v1/staff/dashboard/locations/${locationId}/subscription`, locationSubscriptionResponseSchema, { signal });
}
export function readIntegrations(api: DashboardApiClient, organizationId: string, signal?: AbortSignal) {
  return api.request(`/v1/staff/management/organizations/${organizationId}/integrations`, managementIntegrationsResponseSchema, { signal });
}
