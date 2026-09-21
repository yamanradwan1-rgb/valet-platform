import {
  configurationMutationResponseSchema,
  locationConfigurationResponseSchema,
  managementCompanySettingsResponseSchema,
  managementLocationSettingsResponseSchema,
  type ClearConfigurationOverrideRequest,
  type ManagementCompanySettingClearRequest,
  type ManagementLocationSettingClearRequest,
  type ManagementLocationSettingSetRequest,
  type ManagementSettingSetRequest,
  type SetConfigurationOverrideRequest,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

const orgBase = (organizationId: string) => `/v1/staff/management/organizations/${organizationId}`;

export function readCompanySettings(api: DashboardApiClient, organizationId: string, signal?: AbortSignal) {
  return api.request(`${orgBase(organizationId)}/settings`, managementCompanySettingsResponseSchema, { signal });
}
export function setCompanySetting(api: DashboardApiClient, organizationId: string, body: ManagementSettingSetRequest) {
  return api.request(`${orgBase(organizationId)}/settings/default`, managementCompanySettingsResponseSchema, { body, method: "PUT" });
}
export function clearCompanySetting(api: DashboardApiClient, organizationId: string, body: ManagementCompanySettingClearRequest) {
  return api.request(`${orgBase(organizationId)}/settings/default/clear`, managementCompanySettingsResponseSchema, { body, method: "POST" });
}
export function readManagementLocationSettings(api: DashboardApiClient, organizationId: string, locationId: string, signal?: AbortSignal) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/settings`, managementLocationSettingsResponseSchema, { signal });
}
export function setManagementLocationSetting(api: DashboardApiClient, organizationId: string, locationId: string, body: ManagementLocationSettingSetRequest) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/settings/override`, managementLocationSettingsResponseSchema, { body, method: "PUT" });
}
export function clearManagementLocationSetting(api: DashboardApiClient, organizationId: string, locationId: string, body: ManagementLocationSettingClearRequest) {
  return api.request(`${orgBase(organizationId)}/locations/${locationId}/settings/override/clear`, managementLocationSettingsResponseSchema, { body, method: "POST" });
}

const lmBase = (locationId: string) => `/v1/staff/dashboard/locations/${locationId}/configuration`;
export function readLocationManagerSettings(api: DashboardApiClient, locationId: string, signal?: AbortSignal) {
  return api.request(lmBase(locationId), locationConfigurationResponseSchema, { signal });
}
export function setLocationManagerSetting(api: DashboardApiClient, locationId: string, body: SetConfigurationOverrideRequest) {
  return api.request(`${lmBase(locationId)}/override`, configurationMutationResponseSchema, { body, method: "PUT" });
}
export function clearLocationManagerSetting(api: DashboardApiClient, locationId: string, body: ClearConfigurationOverrideRequest) {
  return api.request(`${lmBase(locationId)}/override/clear`, configurationMutationResponseSchema, { body, method: "POST" });
}
