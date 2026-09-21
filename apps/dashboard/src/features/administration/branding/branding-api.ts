import {
  brandingReadResponseSchema,
  managementCompanyBrandingResponseSchema,
  managementLocationBrandingResponseSchema,
  type BrandingClearRequest,
  type BrandingSetRequest,
  type ManagementBrandingClearRequest,
  type ManagementBrandingSetRequest,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

const orgBase = (organizationId: string) => `/v1/staff/management/organizations/${organizationId}`;

export function readCompanyBranding(api: DashboardApiClient, organizationId: string, signal?: AbortSignal) {
  return api.request(`${orgBase(organizationId)}/branding`, managementCompanyBrandingResponseSchema, { signal });
}
export function setCompanyBranding(api: DashboardApiClient, organizationId: string, body: ManagementBrandingSetRequest) {
  return api.request(`${orgBase(organizationId)}/branding/default`, managementCompanyBrandingResponseSchema, { body, method: "PUT" });
}
export function readManagementLocationBranding(api: DashboardApiClient, organizationId: string, locationId: string, signal?: AbortSignal) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/branding`, managementLocationBrandingResponseSchema, { signal });
}
export function setManagementLocationBranding(api: DashboardApiClient, organizationId: string, locationId: string, body: ManagementBrandingSetRequest) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/branding/override`, managementLocationBrandingResponseSchema, { body, method: "PUT" });
}
export function clearManagementLocationBranding(api: DashboardApiClient, organizationId: string, locationId: string, body: ManagementBrandingClearRequest) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/branding/override/clear`, managementLocationBrandingResponseSchema, { body, method: "POST" });
}

const lmBase = (locationId: string) => `/v1/staff/dashboard/locations/${locationId}/branding`;
export function readLocationManagerBranding(api: DashboardApiClient, locationId: string, signal?: AbortSignal) {
  return api.request(lmBase(locationId), brandingReadResponseSchema, { signal });
}
export function setLocationManagerBranding(api: DashboardApiClient, locationId: string, body: BrandingSetRequest) {
  return api.request(`${lmBase(locationId)}/override`, brandingReadResponseSchema, { body, method: "PUT" });
}
export function clearLocationManagerBranding(api: DashboardApiClient, locationId: string, body: BrandingClearRequest) {
  return api.request(`${lmBase(locationId)}/override/clear`, brandingReadResponseSchema, { body, method: "POST" });
}
