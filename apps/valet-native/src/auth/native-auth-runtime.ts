import {
  EmployeeOperationalSession,
  NativeAuthSession,
} from "@valet/employee-client";

import { nativeIdentityState } from "./identity-state-boundary";
import {
  nativeDebugApiOrigin,
  NativeAuthHttpTransport,
} from "./native-auth-http";
import {
  ExpoInstallationAuthStateStore,
  ExpoSecureRefreshStore,
} from "./native-auth-storage";
import { createNativeOperationalTransport } from "../tasks/native-operational-http";

export interface NativeEmployeeRuntime {
  readonly auth: NativeAuthSession;
  readonly dispose: () => void;
  readonly operations: EmployeeOperationalSession;
}

function installationGeneration(): string {
  const randomPart = Array.from({ length: 4 }, () =>
    Math.random().toString(36).slice(2),
  ).join("");
  return `install-${Date.now().toString(36)}-${randomPart}`.slice(0, 128);
}

function resolveApiOrigin(): string {
  const configuredOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
  const apiOrigin =
    configuredOrigin ?? (__DEV__ ? nativeDebugApiOrigin : undefined);
  if (apiOrigin === undefined) {
    throw new Error(
      "Native API origin is required for release authentication.",
    );
  }
  return apiOrigin;
}

export function createNativeAuthSession(
  apiOrigin = resolveApiOrigin(),
): NativeAuthSession {
  return new NativeAuthSession({
    createInstallationGeneration: installationGeneration,
    identityState: nativeIdentityState,
    installationState: new ExpoInstallationAuthStateStore(),
    secureRefresh: new ExpoSecureRefreshStore(),
    transport: new NativeAuthHttpTransport(apiOrigin),
  });
}

export function createNativeEmployeeRuntime(): NativeEmployeeRuntime {
  const apiOrigin = resolveApiOrigin();
  const auth = createNativeAuthSession(apiOrigin);
  const operations = new EmployeeOperationalSession({
    transport: createNativeOperationalTransport(apiOrigin, auth),
  });
  const dispose = nativeIdentityState.register(() => operations.clear());
  return { auth, dispose, operations };
}
