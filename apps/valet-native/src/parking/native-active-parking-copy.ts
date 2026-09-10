import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export function getNativeActiveParkingCopy(locale: FoundationLocale) {
  const d = getNativeEmployeeDictionary(locale);
  return {
    destination: d.destination,
    elapsed: d.elapsed,
    key: d.key,
    parkVehicle: d.parkVehicle,
    parking: d.parkingState,
    parkingArea: d.parkingArea,
    reportIssue: d.reportIssue,
    vehicle: d.vehicle,
    zone: d.zone,
  };
}
