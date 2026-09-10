import type { EmployeeLocale } from "@valet/employee-client";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../i18n/native-platform-copy";

export interface NativePlateCameraCopy {
  readonly capture: string;
  readonly open: string;
  readonly close: string;
  readonly enter: string;
  readonly retry: string;
  readonly settings: string;
  readonly phases: Readonly<
    Record<
      | "idle"
      | "requesting"
      | "starting"
      | "preview"
      | "denied"
      | "error"
      | "no-match"
      | "unavailable",
      string
    >
  >;
}

export function getNativePlateCameraCopy(
  locale: EmployeeLocale,
): NativePlateCameraCopy {
  const d = getNativeEmployeeDictionary(locale);
  const platform = getNativePlatformCopy(locale);
  return {
    capture: d.plateCameraCapture,
    open: d.plateCameraOpen,
    close: d.plateCameraClose,
    enter: d.enterManually,
    retry: d.plateCameraRetry,
    settings: platform.camera.settings,
    phases: {
      idle: platform.camera.idle,
      requesting: platform.camera.requesting,
      starting: d.plateCameraStarting,
      preview: d.plateCameraPreviewHint,
      denied: platform.camera.denied,
      error: platform.camera.error,
      "no-match": platform.camera.noMatch,
      unavailable: platform.camera.unavailable,
    },
  };
}
