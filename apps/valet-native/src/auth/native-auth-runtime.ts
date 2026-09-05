import {
  createEmployeeCheckInTransport,
  EmployeeCheckInSession,
  EmployeeOperationalSession,
  NativeAuthSession,
} from "@valet/employee-client";

import { nativeIdentityState } from "./identity-state-boundary";
import { resolveNativeApiOrigin } from "./native-api-http";
import { NativeAuthHttpTransport } from "./native-auth-http";
import {
  ExpoInstallationAuthStateStore,
  ExpoSecureRefreshStore,
} from "./native-auth-storage";
import {
  createNativeEmployeeClient,
  createNativeOperationalTransport,
} from "../tasks/native-operational-http";

export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly dispose: () => void;
  readonly operations: EmployeeOperationalSession;
}

function installationGeneration(): string {
  const randomPart = Array.from({ length: 4 }, () =>
    Math.random().toString(36).slice(2),
  ).join("");
  return `install-${Date.now().toString(36)}-${randomPart}`.slice(0, 128);
}

export function createNativeAuthSession(
  apiOrigin = resolveNativeApiOrigin(),
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
  const apiOrigin = resolveNativeApiOrigin();
  const auth = createNativeAuthSession(apiOrigin);
  const operations = new EmployeeOperationalSession({
    initialForeground: false,
    transport: createNativeOperationalTransport(apiOrigin, auth),
  });
  const checkIn = new EmployeeCheckInSession({
    createOperationId: createNativeOperationId,
    transport: createEmployeeCheckInTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const unregisterIdentityPurge = nativeIdentityState.register(() => {
    operations.clear();
    checkIn.clear();
  });
  const dispose = () => {
    unregisterIdentityPurge();
    operations.dispose();
    checkIn.clear();
  };
  return { apiOrigin, auth, checkIn, dispose, operations };
}

function createNativeOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}
