import type { OperatingHoursValue } from "@valet/contracts";

import type {
  StudioDay,
  StudioHoursData,
  StudioSaveResult,
  StudioSettingsData,
} from "./ui/studio-types";
import type { Scalar } from "./ui/catalog";
import type { useStudioSettings } from "./adapters/settings/use-studio-settings";
import type {
  StudioSettingKey,
  StudioSettingValue,
} from "./adapters/settings/studio-settings-types";

type SettingsRead = ReturnType<typeof useStudioSettings>;

const failed: StudioSaveResult = { ok: false, reason: "unavailable" };

function isScalar(value: StudioSettingValue | undefined): value is Scalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function scalars(
  values: Readonly<Partial<Record<StudioSettingKey, StudioSettingValue>>>,
): Record<string, Scalar> {
  const result: Record<string, Scalar> = {};
  for (const [key, value] of Object.entries(values)) {
    if (isScalar(value)) result[key] = value;
  }
  return result;
}

function days(value: StudioSettingValue | undefined): StudioDay[] | null {
  if (!value || typeof value !== "object") return null;
  const operating = value as OperatingHoursValue;
  return operating.days.map((day) => ({ ...day }));
}

function toResult(confirmed: boolean): StudioSaveResult {
  return confirmed ? { ok: true } : failed;
}

export function studioSettingsBridge(
  settings: SettingsRead,
  editable: boolean,
): StudioSettingsData {
  const snapshot = settings.snapshot;
  const keys =
    snapshot?.availableKeys.filter((key) => key !== "operatingHours") ?? [];
  const canEdit =
    editable &&
    !!snapshot &&
    !settings.busy &&
    !settings.loading &&
    settings.error === null;

  return {
    defaults: scalars(snapshot?.defaults ?? {}),
    overrides: scalars(snapshot?.overrides ?? {}),
    effective: scalars(snapshot?.effective ?? {}),
    overridePresent: { ...(snapshot?.overridePresent ?? {}) },
    availableKeys: keys,
    editableKeys: canEdit ? keys : [],
    busy: settings.busy || settings.loading,
    error: settings.mutationError ?? settings.error?.message ?? null,
    save: async (key, value) => {
      if (!canEdit || !keys.some((available) => available === key))
        return failed;
      return toResult(await settings.save(key as StudioSettingKey, value));
    },
    clear: async (key) => {
      if (!canEdit || !keys.some((available) => available === key))
        return failed;
      return toResult(await settings.clear(key as StudioSettingKey));
    },
  };
}

export function studioHoursBridge(
  settings: SettingsRead,
  editable: boolean,
  isLocation: boolean,
  timezone: string | null,
): StudioHoursData {
  const snapshot = settings.snapshot;
  const allowed =
    editable &&
    !!snapshot &&
    snapshot.availableKeys.includes("operatingHours") &&
    !settings.busy &&
    !settings.loading &&
    settings.error === null;
  const present = snapshot?.overridePresent.operatingHours ?? false;
  return {
    company: days(snapshot?.defaults.operatingHours),
    override:
      isLocation && present ? days(snapshot?.overrides.operatingHours) : null,
    effective: days(snapshot?.effective.operatingHours),
    inherited: isLocation && !present,
    timezone,
    editable: allowed,
    busy: settings.busy || settings.loading,
    save: async (input) => {
      if (!allowed || !input) return failed;
      return toResult(await settings.save("operatingHours", { days: input }));
    },
    clear: async () => {
      if (!allowed) return failed;
      return toResult(await settings.clear("operatingHours"));
    },
  };
}
