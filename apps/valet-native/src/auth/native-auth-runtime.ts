import {
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
import { createNativeOperationalTransport } from "../tasks/native-operational-http";

export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
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
    transport: createNativeOperationalTransport(apiOrigin, auth),
  });
  const dispose = nativeIdentityState.register(() => operations.clear());
  return { apiOrigin, auth, dispose, operations };
}
