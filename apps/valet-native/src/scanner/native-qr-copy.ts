import type {
  EmployeeLocale,
  QrCapturePhase,
  QrResourceKind,
} from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../i18n/native-platform-copy";

interface NativeQrCopy {
  title: string;
  disclaimer: string;
  open: string;
  again: string;
  close: string;
  exit: string;
  manual: string;
  manualHint: string;
  settings: string;
  invalid: string;
  kinds: Record<QrResourceKind, string>;
  phases: Record<QrCapturePhase, string>;
}

export function getNativeQrCopy(locale: EmployeeLocale): NativeQrCopy {
  const d = getNativeEmployeeDictionary(locale);
  const platform = getNativePlatformCopy(locale).scanner;
  return {
    title: d.scanNav,
    disclaimer: platform.disclaimer,
    open: d.scannerStartScan,
    again: d.scanAgain,
    close: d.scannerCloseScanner,
    exit: platform.exit,
    manual: d.manualEntry,
    manualHint: d.scannerManualAlwaysAvailable,
    settings: platform.settings,
    invalid: d.scannerUnreadableQr,
    kinds: {
      "key-slot": d.keySlot,
      "parking-spot": d.parkingSpot,
    },
    phases: {
      idle: platform.idle,
      requesting: platform.requesting,
      starting: d.scannerStartingCamera,
      scanning: d.scannerScanningHint,
      accepted: platform.accepted,
      denied: platform.denied,
      unavailable: platform.unavailable,
      error: platform.error,
    },
  };
}
