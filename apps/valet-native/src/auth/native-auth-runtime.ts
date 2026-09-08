import {
  createEmployeeCheckInTransport,
  createEmployeeConfirmParkedTransport,
  createEmployeeParkingStartTransport,
  EmployeeCheckInSession,
  EmployeeConfirmParkedSession,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  EmployeeShiftStartSession,
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
  createNativeShiftStartTransport,
} from "../tasks/native-operational-http";

export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly confirmParking: EmployeeConfirmParkedSession;
  readonly dispose: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly shiftStart: EmployeeShiftStartSession;
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
  const shiftStartObserver: { session?: EmployeeShiftStartSession } = {};
  const operations = new EmployeeOperationalSession({
    initialForeground: false,
    transport: createNativeOperationalTransport(
      apiOrigin,
      auth,
      (identityGeneration, response) =>
        shiftStartObserver.session?.observeOperationalContext(
          identityGeneration,
          response,
        ),
    ),
  });
  const shiftStart = new EmployeeShiftStartSession({
    refreshOperationalContext: () => operations.refresh(),
    transport: createNativeShiftStartTransport(apiOrigin, auth),
  });
  shiftStartObserver.session = shiftStart;
  const parking = new EmployeeParkingStartSession({
    transport: createEmployeeParkingStartTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const confirmParking = new EmployeeConfirmParkedSession({
    transport: createEmployeeConfirmParkedTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const checkIn = new EmployeeCheckInSession({
    createOperationId: createNativeOperationId,
    transport: createEmployeeCheckInTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const unregisterIdentityPurge = nativeIdentityState.register(() => {
    operations.clear();
    confirmParking.clear();
    parking.clear();
    shiftStart.clear();
    checkIn.clear();
  });
  const dispose = () => {
    unregisterIdentityPurge();
    operations.dispose();
    confirmParking.clear();
    parking.clear();
    shiftStart.clear();
    checkIn.clear();
  };
  return {
    apiOrigin,
    auth,
    checkIn,
    confirmParking,
    dispose,
    operations,
    parking,
    shiftStart,
  };
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
