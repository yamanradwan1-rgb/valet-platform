import type { ResourceVehicleIdentity } from "@valet/contracts";

import type { DashboardLocale } from "../i18n/locale";

export function resourceVehicleIdentity(
  vehicle: ResourceVehicleIdentity | null,
  locale: DashboardLocale,
) {
  const plate = vehicle?.plateNumberNormalized?.trim();
  if (plate) return { label: plate, dir: "ltr" as const };
  return {
    label:
      vehicle?.temporaryDescriptor?.trim() ||
      (locale === "ar"
        ? "هوية المركبة غير متاحة"
        : "Vehicle identity unavailable"),
    dir: "auto" as const,
  };
}
