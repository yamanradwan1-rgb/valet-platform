import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export interface NativeRetrievalCopy {
  readonly assignedBody: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly checkState: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly expectedKeySlot: string;
  readonly elapsed: string;
  readonly enterKeySlotCode: string;
  readonly key: string;
  readonly keySlotVerified: string;
  readonly keyTitle: string;
  readonly keyVerifyBody: string;
  readonly keyVerifyLabel: string;
  readonly loading: string;
  readonly location: string;
  readonly readyBody: string;
  readonly readyTitle: string;
  readonly retrievingBody: string;
  readonly retrievingLabel: string;
  readonly retrievalBadge: string;
  readonly startRetrieval: string;
  readonly startingRetrieval: string;
  readonly taskTitle: string;
  readonly vehicle: string;
  readonly unknownBody: string;
  readonly unknownTitle: string;
  readonly unavailableBody: string;
  readonly unavailableTitle: string;
  readonly vehicleReady: string;
  readonly markingReady: string;
  readonly reportIssue: string;
  readonly zone: string;
  readonly spot: string;
  readonly scanQr: string;
  readonly closeScanner: string;
  readonly manualHint: string;
  readonly operationFailed: string;
}

export function getNativeRetrievalCopy(
  locale: FoundationLocale,
): NativeRetrievalCopy {
  const d = getNativeEmployeeDictionary(locale);
  return {
    assignedBody: d.retrievalOperation,
    back: d.back,
    backToTasks: d.backToQueue,
    checkState: d.retry,
    conflictBody: d.operationFailed,
    conflictTitle: d.connectionIssue,
    expectedKeySlot: d.expectedKeySlot,
    elapsed: d.elapsed,
    enterKeySlotCode: d.enterKeySlotCode,
    key: d.key,
    keySlotVerified: d.keySlotVerified,
    keyTitle: d.keyCheckout,
    keyVerifyBody: d.expectedKeySlot,
    keyVerifyLabel: d.verifyKeySlot,
    loading: d.loadingRetrieval,
    location: d.location,
    readyBody: d.readyForGuest,
    readyTitle: d.vehicleReadyTitle,
    retrievingBody: d.retrievalOperation,
    retrievingLabel: d.retrievingLabel,
    retrievalBadge: d.retrievalState,
    startRetrieval: d.startRetrievalAction,
    startingRetrieval: d.startingRetrieval,
    taskTitle: d.retrievalOperation,
    vehicle: d.vehicle,
    unknownBody: d.operationFailed,
    unknownTitle: d.connectionIssue,
    unavailableBody: d.operationFailed,
    unavailableTitle: d.cannotResumeRetrieval,
    vehicleReady: d.markReady,
    markingReady: d.markingReady,
    reportIssue: d.reportIssue,
    zone: d.zone,
    spot: d.spot,
    scanQr: d.scannerStartScan,
    closeScanner: d.scannerCloseScanner,
    manualHint: d.chooseManually,
    operationFailed: d.operationFailed,
  };
}
