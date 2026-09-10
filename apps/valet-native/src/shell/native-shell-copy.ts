import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../i18n/native-platform-copy";

export function getNativeShellCopy(locale: EmployeeLocale) {
  const d = getNativeEmployeeDictionary(locale);
  const platform = getNativePlatformCopy(locale);
  return {
    accessDeniedBody: d.operationFailed,
    accessDeniedTitle: d.couldNotLoadContext,
    activeShiftsFound: d.activeShiftsFound,
    ambiguousShiftDetail: d.ambiguousShiftDetail,
    authErrorTitle: platform.auth.fatalTitle,
    authRecoveryTitle: d.couldNotLoadContext,
    back: d.back,
    checkIn: d.newVehicle,
    contextErrorBody: d.operationFailed,
    contextErrorTitle: d.couldNotLoadContext,
    loadingContext: d.loadingContext,
    multipleShiftsBody: d.ambiguousShiftDetail,
    multipleShiftsTitle: d.multipleActiveShifts,
    noLocationBody: d.noActiveShiftDetail,
    noLocationTitle: d.noActiveShift,
    noShiftBody: d.startShiftPrompt,
    noShiftTitle: d.noActiveShift,
    retry: d.retry,
    scan: d.scanNav,
    shift: d.shiftNav,
    shiftNav: d.shiftNav,
    signOut: d.signOut,
    staffSignIn: d.staffSignIn,
    tasks: d.tasksTitle,
    unavailable: d.operationFailed,
    vehicles: d.vehiclesNav,
  };
}
