import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeCheckInContinuationCopy {
  readonly authoritative: string;
  readonly cancel: string;
  readonly checkState: string;
  readonly checkingState: string;
  readonly color: string;
  readonly confirmPlateBody: string;
  readonly confirmPlateSave: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly correctionUnknown: string;
  readonly correctionUnknownTitle: string;
  readonly custodyConflict: string;
  readonly descriptor: string;
  readonly detailsNoChange: string;
  readonly detailsSaved: string;
  readonly editDetails: string;
  readonly editIdentity: string;
  readonly identitySaved: string;
  readonly identityConflict: string;
  readonly invalid: string;
  readonly make: string;
  readonly model: string;
  readonly notMutable: string;
  readonly plateCountry: string;
  readonly plateNumber: string;
  readonly reconciled: string;
  readonly reviewPlate: string;
  readonly saveDescription: string;
  readonly saveDetails: string;
  readonly saving: string;
  readonly title: string;
  readonly unknown: string;
  readonly useDescriptor: string;
  readonly usePlate: string;
}

export function getNativeCheckInContinuationCopy(
  locale: EmployeeLocale,
): NativeCheckInContinuationCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    authoritative: d.vehicle,
    cancel: d.cancelAction,
    checkState: d.retry,
    checkingState: d.checkingDrafts,
    color: d.color,
    confirmPlateBody: d.confirmPlate,
    confirmPlateSave: d.confirmPlate,
    conflictBody: d.operationFailed,
    conflictTitle: d.connectionIssue,
    correctionUnknown: d.operationFailed,
    correctionUnknownTitle: d.connectionIssue,
    custodyConflict: d.operationFailed,
    descriptor: d.vehicleDescription,
    detailsNoChange: d.vehicleDetailsUpdated,
    detailsSaved: d.vehicleDetailsUpdated,
    editDetails: d.correctVehicleDetails,
    editIdentity: d.correctVehicleDetails,
    identitySaved: d.vehicleDetailsUpdated,
    identityConflict: d.operationFailed,
    invalid: d.operationFailed,
    make: d.make,
    model: d.model,
    notMutable: d.operationFailed,
    plateCountry: d.countryRegion,
    plateNumber: d.licensePlate,
    reconciled: d.vehicleDetailsUpdated,
    reviewPlate: d.confirmPlate,
    saveDescription: d.confirm,
    saveDetails: d.confirm,
    saving: d.processing,
    title: d.vehicleDetails,
    unknown: d.unknown,
    useDescriptor: d.noPlateUnreadable,
    usePlate: d.licensePlate,
  };
}
