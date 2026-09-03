import { NativeAuthSession } from "@valet/employee-client";

import { nativeIdentityState } from "./identity-state-boundary";
import {
  nativeDebugApiOrigin,
  NativeAuthHttpTransport,
} from "./native-auth-http";
import {
  ExpoInstallationAuthStateStore,
  ExpoSecureRefreshStore,
} from "./native-auth-storage";

function installationGeneration(): string {
  const randomPart = Array.from({ length: 4 }, () =>
    Math.random().toString(36).slice(2),
  ).join("");
  return `install-${Date.now().toString(36)}-${randomPart}`.slice(0, 128);
}

export function createNativeAuthSession(): NativeAuthSession {
  const configuredOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  const apiOrigin =
    configuredOrigin ?? (__DEV__ ? nativeDebugApiOrigin : undefined);
  if (apiOrigin === undefined) {
    throw new Error(
      "Native API origin is required for release authentication.",
    );
  }
  return new NativeAuthSession({
    createInstallationGeneration: installationGeneration,
    identityState: nativeIdentityState,
    installationState: new ExpoInstallationAuthStateStore(),
    secureRefresh: new ExpoSecureRefreshStore(),
    transport: new NativeAuthHttpTransport(apiOrigin),
  });
}
