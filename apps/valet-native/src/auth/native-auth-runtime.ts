import {
  createEmployeeCheckInTransport,
  createEmployeeConfirmParkedTransport,
  createEmployeeHandoffTransport,
  createEmployeeParkingStartTransport,
  createEmployeeReleaseTransport,
  createEmployeeRetrievalTransport,
  EmployeeCheckInSession,
  EmployeeConfirmParkedSession,
  EmployeeHandoffSession,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  EmployeeReleaseSession,
  EmployeeRetrievalSession,
  EmployeeShiftEndSession,
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
  createNativeShiftEndTransport,
  createNativeShiftStartTransport,
} from "../tasks/native-operational-http";
import { nativeOnlineHint } from "../shift/native-shift-connectivity";
import { retireNativeShiftScope } from "../shift/native-shift-retirement";

export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly confirmParking: EmployeeConfirmParkedSession;
  readonly dispose: () => void;
  readonly handoff: EmployeeHandoffSession;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly release: EmployeeReleaseSession;
  readonly retrieval: EmployeeRetrievalSession;
  readonly shiftEnd: EmployeeShiftEndSession;
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
  const shiftObserver: {
    end?: EmployeeShiftEndSession;
    start?: EmployeeShiftStartSession;
  } = {};
  const operations = new EmployeeOperationalSession({
    initialForeground: false,
    transport: createNativeOperationalTransport(
      apiOrigin,
      auth,
      (identityGeneration, response) => {
        shiftObserver.start?.observeOperationalContext(
          identityGeneration,
          response,
        );
        shiftObserver.end?.observeOperationalContext(
          identityGeneration,
          response,
        );
      },
    ),
  });
  const shiftStart = new EmployeeShiftStartSession({
    refreshOperationalContext: () => operations.refresh(),
    transport: createNativeShiftStartTransport(apiOrigin, auth),
  });
  shiftObserver.start = shiftStart;
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
  const release = new EmployeeReleaseSession({
    transport: createEmployeeReleaseTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const handoff = new EmployeeHandoffSession({
    onStateChange: (snapshot) => {
      if (
        snapshot.phase === "verified" &&
        snapshot.identityGeneration !== null &&
        snapshot.scope !== null &&
        snapshot.task !== null &&
        snapshot.session !== null
      ) {
        void release.openTask(
          snapshot.identityGeneration,
          snapshot.scope,
          snapshot.task.taskId,
          snapshot.session.sessionId,
        );
      }
    },
    transport: createEmployeeHandoffTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const retrieval = new EmployeeRetrievalSession({
    onStateChange: (snapshot) => {
      if (
        snapshot.phase === "ready" &&
        snapshot.identityGeneration !== null &&
        snapshot.scope !== null &&
        snapshot.task !== null &&
        snapshot.session !== null
      ) {
        void handoff.openTask(
          snapshot.identityGeneration,
          snapshot.scope,
          snapshot.task.taskId,
          snapshot.session.sessionId,
        );
      }
    },
    transport: createEmployeeRetrievalTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const checkIn = new EmployeeCheckInSession({
    createOperationId: createNativeOperationId,
    transport: createEmployeeCheckInTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const shiftEnd = new EmployeeShiftEndSession({
    initialOnline: nativeOnlineHint(),
    onEnded: () =>
      retireNativeShiftScope({
        checkIn,
        confirmParking,
        handoff,
        operations,
        parking,
        release,
        retrieval,
        shiftStart,
      }),
    transport: createNativeShiftEndTransport(apiOrigin, auth),
  });
  shiftObserver.end = shiftEnd;
  const unregisterIdentityPurge = nativeIdentityState.register(() => {
    operations.clear();
    confirmParking.clear();
    handoff.clear();
    parking.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.clear();
    shiftStart.clear();
    checkIn.clear();
  });
  const dispose = () => {
    unregisterIdentityPurge();
    operations.dispose();
    confirmParking.clear();
    handoff.clear();
    parking.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.clear();
    shiftStart.clear();
    checkIn.clear();
  };
  return {
    apiOrigin,
    auth,
    checkIn,
    confirmParking,
    dispose,
    handoff,
    operations,
    parking,
    release,
    retrieval,
    shiftEnd,
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
