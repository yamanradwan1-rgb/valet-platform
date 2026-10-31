import {
  managementSettingKeySchema,
  type LocationConfigurationResponse,
  type ManagementCompanySettingsResponse,
  type ManagementLocationSettingsResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { dashboardMalformedError } from "../../../../../lib/api/dashboard-api-error";
import {
  readCompanySettings,
  readLocationManagerSettings,
  readManagementLocationSettings,
} from "../../../settings/settings-api";
import type {
  StudioSettingKey,
  StudioSettingValue,
  StudioSettingsScope,
  StudioSettingsSnapshot,
} from "./studio-settings-types";

export type { StudioSettingKey, StudioSettingValue, StudioSettingsScope, StudioSettingsSnapshot } from "./studio-settings-types";

const companyKeys = managementSettingKeySchema.options;
const locationKeys = [...companyKeys, "slaTargetSeconds"] as const;

type SettingProjection = {
  readonly default: StudioSettingValue;
  readonly overridePresent: boolean;
  readonly override: StudioSettingValue;
  readonly effective: StudioSettingValue;
};

function companyProjection(
  scope: Extract<StudioSettingsScope, { kind: "company" }>,
  data: ManagementCompanySettingsResponse,
): StudioSettingsSnapshot {
  if (data.organizationId !== scope.organizationId) throw dashboardMalformedError();
  return {
    scope, organizationId: data.organizationId, locationId: null, updatedAt: data.updatedAt,
    defaults: data.defaults,
    overrides: {},
    effective: data.defaults,
    overridePresent: {},
    availableKeys: companyKeys,
  };
}

function locationProjection(
  scope: Extract<StudioSettingsScope, { kind: "management-location" }>,
  data: ManagementLocationSettingsResponse,
): StudioSettingsSnapshot {
  if (data.organizationId !== scope.organizationId || data.locationId !== scope.locationId)
    throw dashboardMalformedError();
  const defaults: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const overrides: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const effective: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const overridePresent: Partial<Record<StudioSettingKey, boolean>> = {};
  const records = data.settings as unknown as Readonly<Record<string, SettingProjection | number | null>>;
  for (const key of companyKeys) {
    const item = records[key] as SettingProjection;
    defaults[key] = item.default;
    overrides[key] = item.override;
    effective[key] = item.effective;
    overridePresent[key] = item.overridePresent;
  }
  // SLA is Location-only, with no Company default and no inheritance semantics.
  effective.slaTargetSeconds = data.settings.slaTargetSeconds;
  overridePresent.slaTargetSeconds = data.settings.slaTargetSeconds !== null;
  return {
    scope, organizationId: data.organizationId, locationId: data.locationId,
    updatedAt: data.updatedAt, defaults, overrides, effective, overridePresent,
    availableKeys: locationKeys,
  };
}

function managerProjection(
  scope: Extract<StudioSettingsScope, { kind: "manager-location" }>,
  data: LocationConfigurationResponse,
): StudioSettingsSnapshot {
  if (data.locationId !== scope.locationId) throw dashboardMalformedError();
  const defaults: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const overrides: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const effective: Partial<Record<StudioSettingKey, StudioSettingValue>> = {};
  const overridePresent: Partial<Record<StudioSettingKey, boolean>> = {};
  for (const item of data.settings) {
    defaults[item.setting] = item.default;
    overrides[item.setting] = item.override;
    effective[item.setting] = item.effective;
    overridePresent[item.setting] = item.overridePresent;
  }
  return {
    scope, organizationId: data.organizationId, locationId: data.locationId,
    updatedAt: data.updatedAt, defaults, overrides, effective, overridePresent,
    availableKeys: data.settings.map((item) => item.setting),
  };
}

/** Real read endpoints validate their response before any Studio projection. */
export async function readStudioSettings(
  api: DashboardApiClient,
  scope: StudioSettingsScope,
  signal?: AbortSignal,
): Promise<StudioSettingsSnapshot> {
  switch (scope.kind) {
    case "company":
      return companyProjection(scope, await readCompanySettings(api, scope.organizationId, signal));
    case "management-location":
      return locationProjection(
        scope, await readManagementLocationSettings(api, scope.organizationId, scope.locationId, signal),
      );
    case "manager-location":
      return managerProjection(scope, await readLocationManagerSettings(api, scope.locationId, signal));
  }
}
