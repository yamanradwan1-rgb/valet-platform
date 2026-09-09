import type { StaffVehicleDirectoryRow } from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeVehiclesCopy } from "./native-vehicles-copy";

export function nativeVehicleTitle(
  row: StaffVehicleDirectoryRow,
  fallback: string,
) {
  const title = [row.vehicle.make, row.vehicle.model]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  return title || row.vehicle.temporaryDescriptor?.trim() || fallback;
}

export function nativeVehicleBadge(
  row: StaffVehicleDirectoryRow,
  copy: NativeVehiclesCopy,
) {
  const variants = {
    CHECKING_IN: "primary",
    AWAITING_PARKING: "neutral",
    PARKING: "warning",
    PARKED: "success",
    REQUESTED: "warning",
    RETRIEVING: "primary",
    READY: "success",
    HANDOFF_PENDING: "successSoft",
  } as const;
  return { label: copy.badges[row.state]!, variant: variants[row.state] };
}

export function formatNativeVehicleDateTime(
  value: string,
  locale: FoundationLocale,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
