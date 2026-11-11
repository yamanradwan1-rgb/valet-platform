import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

const conflictBodyByLocale = {
  ar: "تحقّق من حالة المهمة أو عُد إلى قائمة المهام.",
  en: "Check task status or return to the queue.",
} satisfies Record<FoundationLocale, string>;

const unknownTitleByLocale = {
  ar: "تعذر التحقق من حالة المهمة",
  en: "Unable to verify task status",
} satisfies Record<FoundationLocale, string>;

const unknownBodyByLocale = {
  ar: "تعذر التأكد من نتيجة العملية. تحقّق من حالة المهمة قبل اتخاذ إجراء آخر.",
  en: "The operation result could not be confirmed. Check task status before taking another action.",
} satisfies Record<FoundationLocale, string>;

const unknownCheckLabelByLocale = {
  ar: "تحقق من حالة المهمة",
  en: "Check task status",
} satisfies Record<FoundationLocale, string>;

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
  readonly locationNotSpecified: string;
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
  readonly unknownCheckLabel: string;
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
    conflictBody: conflictBodyByLocale[locale],
    conflictTitle: d.cannotResumeRetrieval,
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
    locationNotSpecified: d.notSpecified,
    readyBody: d.readyForGuest,
    readyTitle: d.vehicleReadyTitle,
    retrievingBody: d.retrievalOperation,
    retrievingLabel: d.retrievingLabel,
    retrievalBadge: d.retrievalState,
    startRetrieval: d.startRetrievalAction,
    startingRetrieval: d.startingRetrieval,
    taskTitle: d.retrievalOperation,
    vehicle: d.vehicle,
    unknownBody: unknownBodyByLocale[locale],
    unknownCheckLabel: unknownCheckLabelByLocale[locale],
    unknownTitle: unknownTitleByLocale[locale],
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
