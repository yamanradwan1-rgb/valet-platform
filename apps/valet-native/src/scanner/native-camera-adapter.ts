import { Camera } from "expo-camera";
import type { NativeCameraPermissionPort } from "./native-qr-controller";

export const nativeCameraPermissions: NativeCameraPermissionPort = {
  get: Camera.getCameraPermissionsAsync,
  request: Camera.requestCameraPermissionsAsync,
};

export const nativeQrCameraSettings = {
  facing: "back" as const,
  barcodeScannerSettings: { barcodeTypes: ["qr" as const] },
  mute: true,
};
