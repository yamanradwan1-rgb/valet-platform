import type { ManagementSettingKey, OperatingHoursValue } from "@valet/contracts";

export type StudioSettingKey = ManagementSettingKey | "slaTargetSeconds";
export type StudioSettingValue = string | number | boolean | OperatingHoursValue | null;

/** Authority selects a real, existing settings route; never a client-asserted role. */
export type StudioSettingsScope =
  | { readonly kind: "company"; readonly organizationId: string }
  | { readonly kind: "management-location"; readonly organizationId: string; readonly locationId: string }
  | { readonly kind: "manager-location"; readonly locationId: string };

/** Read-only authoritative server projection, not an editable local store. */
export interface StudioSettingsSnapshot {
  readonly scope: StudioSettingsScope;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly updatedAt: string;
  readonly defaults: Readonly<Partial<Record<StudioSettingKey, StudioSettingValue>>>;
  readonly overrides: Readonly<Partial<Record<StudioSettingKey, StudioSettingValue>>>;
  readonly effective: Readonly<Partial<Record<StudioSettingKey, StudioSettingValue>>>;
  readonly overridePresent: Readonly<Partial<Record<StudioSettingKey, boolean>>>;
  readonly availableKeys: readonly StudioSettingKey[];
}
