import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeReleaseCopy {
  authorityBody: string;
  authorityTitle: string;
  back: string;
  cannotUndo: string;
  check: string;
  completedBody: string;
  completedTitle: string;
  conflictBody: string;
  dynamicQr: string;
  financialBody: string;
  identityVerified: string;
  nextTask: string;
  pickupCode: string;
  policyBody: string;
  releaseBlocked: string;
  releaseVehicle: string;
  releasing: string;
  supervisorOverride: string;
  taskTitle: string;
  unknownBody: string;
  unavailableBody: string;
  awaitingTaskOwner: string;
  reportIssue: string;
}

export function getNativeReleaseCopy(
  locale: FoundationLocale,
): NativeReleaseCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    authorityBody: d.releaseOwnerRequired,
    authorityTitle: d.awaitingTaskOwner,
    back: d.back,
    cannotUndo: d.cannotUndo,
    check: d.retry,
    completedBody: d.completedCustody,
    completedTitle: d.handoffComplete,
    conflictBody: d.operationFailed,
    dynamicQr: d.guestQr,
    financialBody: d.releaseBlocked,
    identityVerified: d.identityVerified,
    nextTask: d.nextTask,
    pickupCode: d.pickupCodeLabel,
    policyBody: d.releaseBlocked,
    releaseBlocked: d.releaseBlocked,
    releaseVehicle: d.releaseVehicle,
    releasing: d.releasing,
    supervisorOverride: d.supervisorOverrideLabel,
    taskTitle: d.guestHandoffTitle,
    unknownBody: d.operationFailed,
    unavailableBody: d.operationFailed,
    awaitingTaskOwner: d.awaitingTaskOwner,
    reportIssue: d.reportIssue,
  };
}
