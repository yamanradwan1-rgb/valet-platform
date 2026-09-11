import { Platform } from "react-native";

import { ExpoNativePushResponsePlatform } from "./expo-native-push-response-platform";
import { NativePushResponseCapture } from "./native-push-response-capture";

const singletonKey = "__vayletNativePushResponseCapture_v1";
type CaptureGlobal = typeof globalThis & {
  [singletonKey]?: NativePushResponseCapture;
};

const captureGlobal = globalThis as CaptureGlobal;

export const nativePushResponseCapture =
  captureGlobal[singletonKey] ??
  new NativePushResponseCapture(new ExpoNativePushResponsePlatform());

captureGlobal[singletonKey] = nativePushResponseCapture;

export function startNativePushResponseCapture(): void {
  if (Platform.OS === "web") return;
  void nativePushResponseCapture.start();
}
