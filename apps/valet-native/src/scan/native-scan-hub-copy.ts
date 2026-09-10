import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeScanHubCopy {
  readonly keySlot: string;
  readonly keySlotDisabled: string;
  readonly licensePlate: string;
  readonly licensePlateSubtitle: string;
  readonly parkingDisabled: string;
  readonly parkingResume: string;
  readonly parkingSpot: string;
  readonly pickupHandoff: string;
  readonly retrievalDisabled: string;
  readonly retrievalResume: string;
  readonly scan: string;
  readonly subtitle: string;
}

export function getNativeScanHubCopy(
  locale: EmployeeLocale,
): NativeScanHubCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    keySlot: d.keySlot,
    keySlotDisabled: d.scanHubKeySlotDisabled,
    licensePlate: d.licensePlate,
    licensePlateSubtitle: d.scanHubLicensePlateSub,
    parkingDisabled: d.scanHubParkingDisabled,
    parkingResume: d.scanHubParkingResume,
    parkingSpot: d.parkingSpot,
    pickupHandoff: d.scanHubPickupLabel,
    retrievalDisabled: d.scanHubRetrievalDisabled,
    retrievalResume: d.scanHubRetrievalResume,
    scan: d.scanNav,
    subtitle: d.scanHubSubtitle,
  };
}
