import {
  clearConfigurationOverrideRequestSchema,
  managementCompanySettingClearRequestSchema,
  managementLocationSettingClearRequestSchema,
  managementLocationSettingSetRequestSchema,
  managementSettingSetRequestSchema,
  setConfigurationOverrideRequestSchema,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../../lib/api/dashboard-api-error";
import {
  clearCompanySetting,
  clearLocationManagerSetting,
  clearManagementLocationSetting,
  setCompanySetting,
  setLocationManagerSetting,
  setManagementLocationSetting,
} from "../../../settings/settings-api";
import type { StudioSettingKey, StudioSettingsSnapshot } from "./studio-settings-types";

function rejectUnsupported(): never {
  throw new DashboardApiError({
    kind: "validation", message: "This setting is unavailable for the current scope.",
  });
}

/** Every request uses the last read server CAS token; stale writes fail on the API. */
export function studioSettingsCommands(api: DashboardApiClient, snapshot: StudioSettingsSnapshot) {
  const scope = snapshot.scope;
  const permitted = (key: StudioSettingKey) => {
    if (!snapshot.availableKeys.includes(key)) rejectUnsupported();
  };

  return {
    async save(key: StudioSettingKey, value: unknown) {
      permitted(key);
      const body = { setting: key, value, expectedUpdatedAt: snapshot.updatedAt };
      switch (scope.kind) {
        case "company":
          return setCompanySetting(api, scope.organizationId, managementSettingSetRequestSchema.parse(body));
        case "management-location":
          return setManagementLocationSetting(
            api, scope.organizationId, scope.locationId,
            managementLocationSettingSetRequestSchema.parse(body),
          );
        case "manager-location":
          return setLocationManagerSetting(
            api, scope.locationId, setConfigurationOverrideRequestSchema.parse(body),
          );
      }
    },
    async clear(key: StudioSettingKey) {
      permitted(key);
      const body = { setting: key, expectedUpdatedAt: snapshot.updatedAt };
      switch (scope.kind) {
        case "company":
          return clearCompanySetting(
            api, scope.organizationId, managementCompanySettingClearRequestSchema.parse(body),
          );
        case "management-location":
          return clearManagementLocationSetting(
            api, scope.organizationId, scope.locationId,
            managementLocationSettingClearRequestSchema.parse(body),
          );
        case "manager-location":
          return clearLocationManagerSetting(
            api, scope.locationId, clearConfigurationOverrideRequestSchema.parse(body),
          );
      }
    },
  };
}
