import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../i18n/native-platform-copy";

export interface NativeHandoffCopy {
  abort: string;
  abortTitle: string;
  abortReason: string;
  aborting: string;
  awaiting: string;
  back: string;
  begin: string;
  beginning: string;
  camera: string;
  check: string;
  closeCamera: string;
  conflictBody: string;
  dynamicQr: string;
  guestHandoff: string;
  failure: string;
  invalidCode: string;
  invalidQr: string;
  manualQr: string;
  manualHint: string;
  override: string;
  overrideReason: string;
  overrideVerified: string;
  overriding: string;
  pendingBody: string;
  pickupCode: string;
  pickupPlaceholder: string;
  qrPlaceholder: string;
  readyForPickup: string;
  reasonRequired: string;
  reportIssue: string;
  readyBody: string;
  retryAfter: (seconds: number) => string;
  settings: string;
  supervisorTitle: string;
  key: string;
  taskTitle: string;
  unknownBody: string;
  unavailableBody: string;
  verifiedBody: string;
  verifiedTitle: string;
  verifyCode: string;
  verifyQr: string;
  verifying: string;
}

export function getNativeHandoffCopy(
  locale: FoundationLocale,
): NativeHandoffCopy {
  const d = getNativeEmployeeDictionary(locale);
  const platform = getNativePlatformCopy(locale);
  return {
    abort: d.abortHandoff,
    abortTitle: d.abort,
    abortReason: d.reasonRequired,
    aborting: d.processing,
    awaiting: d.awaitingGuestProof,
    back: d.back,
    begin: d.beginGuestHandoff,
    beginning: d.startingHandoff,
    camera: d.scannerStartScan,
    check: d.retry,
    closeCamera: d.scannerCloseScanner,
    conflictBody: d.operationFailed,
    dynamicQr: d.guestQrCode,
    guestHandoff: d.guestHandoffTitle,
    failure: d.operationFailed,
    invalidCode: d.operationFailed,
    invalidQr: d.scannerWrongTypeHandoff,
    manualQr: d.manualEntry,
    manualHint: d.scannerManualAlwaysAvailable,
    override: d.overrideVerification,
    overrideReason: d.reasonRequired,
    overrideVerified: d.supervisorOverrideLabel,
    overriding: d.processing,
    pendingBody: d.awaitingGuestProof,
    pickupCode: d.pickupCodeLabel,
    pickupPlaceholder: "0000",
    qrPlaceholder: "vhq1.…",
    readyForPickup: d.readyForPickup,
    reasonRequired: d.reasonRequired,
    reportIssue: d.reportIssue,
    readyBody: d.readyForGuest,
    retryAfter: (seconds) => `${d.retryIn} ${seconds}s.`,
    settings: platform.scanner.settings,
    supervisorTitle: d.supervisorOverrideLabel,
    key: d.key,
    taskTitle: d.vehicleReadyTitle,
    unknownBody: d.operationFailed,
    unavailableBody: d.operationFailed,
    verifiedBody: d.identityVerified,
    verifiedTitle: d.identityVerified,
    verifyCode: d.verifyCode,
    verifyQr: d.verifyQr,
    verifying: d.processing,
  };
}

export function presentHandoffFailure(
  copy: NativeHandoffCopy,
  failure: {
    readonly message: string;
    readonly retryAfter?: number | undefined;
  },
) {
  return failure.retryAfter !== undefined && failure.retryAfter > 0
    ? `${failure.message} ${copy.retryAfter(failure.retryAfter)}`
    : failure.message;
}
