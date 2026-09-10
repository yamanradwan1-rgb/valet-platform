import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeCheckInConditionCopy {
  readonly checkingConditionState: string;
  readonly conditionCompletedStatus: string;
  readonly completingCondition: string;
  readonly conditionUnknown: string;
  readonly conditionUnknownTitle: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly existingDamage: string;
  readonly genericFailure: string;
  readonly needsReview: string;
  readonly noVisibleIssue: string;
  readonly photoRequired: string;
  readonly photoPolicyNotice: string;
  readonly selected: string;
  readonly title: string;
}

export function getNativeCheckInConditionCopy(
  locale: EmployeeLocale,
): NativeCheckInConditionCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    checkingConditionState: d.checkingDrafts,
    conditionCompletedStatus: d.awaitingParking,
    completingCondition: d.completingCondition,
    conditionUnknown: d.operationFailed,
    conditionUnknownTitle: d.connectionIssue,
    conflictBody: d.operationFailed,
    conflictTitle: d.connectionIssue,
    existingDamage: d.existingDamage,
    genericFailure: d.operationFailed,
    needsReview: d.needsReview,
    noVisibleIssue: d.noVisibleIssue,
    photoRequired: d.operationFailed,
    photoPolicyNotice: d.photosOptional,
    selected: d.confirm,
    title: d.vehicleCondition,
  };
}
