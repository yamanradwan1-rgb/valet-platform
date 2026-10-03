import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import type { FoundationLocale } from "../foundation/foundation-locale";

export function nativeCheckInActionsCopy(locale: FoundationLocale) {
  const d = getNativeEmployeeDictionary(locale);
  return {
    incomplete: d.vehiclesIncompleteCheckIn,
    continue: d.vehiclesContinueCheckIn,
    cancel: d.vehiclesCancelCheckIn,
    title: d.vehiclesCancelCheckInTitle,
    body: d.vehiclesCancelCheckInBody,
    keep: d.vehiclesKeepCheckIn,
    preparing: d.vehiclesPreparingCheckIn,
    submitting: d.vehiclesCancellingCheckIn,
    unknown: d.vehiclesCancelUnknown,
    check: d.vehiclesCheckCancelState,
    retry: d.vehiclesRetryCancel,
    conflict: d.vehiclesCheckInChanged,
    unavailable: d.vehiclesCheckInUnavailable,
    success: d.vehiclesCheckInCancelled,
  };
}
