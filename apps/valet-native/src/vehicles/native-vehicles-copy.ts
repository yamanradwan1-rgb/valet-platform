import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeVehiclesCopy {
  readonly checkedIn: string;
  readonly descriptorMissing: string;
  readonly detailReadOnly: string;
  readonly emptyDetail: string;
  readonly emptyTitle: string;
  readonly keySlot: string;
  readonly loadFailed: string;
  readonly loading: string;
  readonly location: string;
  readonly noPlate: string;
  readonly notAssigned: string;
  readonly operationFailed: string;
  readonly parkingArea: string;
  readonly refreshing: string;
  readonly retry: string;
  readonly spot: string;
  readonly status: string;
  readonly truncated: string;
  readonly updated: string;
  readonly vehicles: string;
  readonly zone: string;
  readonly badges: Record<string, string>;
}

export function getNativeVehiclesCopy(
  locale: FoundationLocale,
): NativeVehiclesCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    checkedIn: d.vehiclesCheckedInLabel,
    descriptorMissing: d.vehiclesDescriptorMissing,
    detailReadOnly: d.vehiclesDetailReadOnly,
    emptyDetail: d.vehiclesEmptyDetail,
    emptyTitle: d.vehiclesEmptyTitle,
    keySlot: d.keySlot,
    loadFailed: d.vehiclesLoadFailed,
    loading: d.vehiclesLoading,
    location: d.location,
    noPlate: d.noPlate,
    notAssigned: d.notAssigned,
    operationFailed: d.operationFailed,
    parkingArea: d.parkingArea,
    refreshing: d.vehiclesRefreshing,
    retry: d.retry,
    spot: d.spotCode,
    status: d.statusLabel,
    truncated: d.vehiclesTruncatedNotice,
    updated: d.vehiclesUpdatedAtLabel,
    vehicles: d.vehiclesNav,
    zone: d.zone,
    badges: {
      CHECKING_IN: d.checkInState,
      AWAITING_PARKING: d.queuedState,
      PARKING: d.parkingState,
      PARKED: d.parkedState,
      REQUESTED: d.requestedState,
      RETRIEVING: d.retrievalState,
      READY: d.readyForPickup,
      HANDOFF_PENDING: d.handoffState,
    },
  };
}
