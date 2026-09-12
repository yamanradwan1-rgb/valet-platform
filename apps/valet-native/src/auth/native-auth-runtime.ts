import {
  createEmployeeCheckInTransport,
  createEmployeeConfirmParkedTransport,
  createEmployeeHandoffTransport,
  createEmployeeParkingStartTransport,
  createEmployeeReleaseTransport,
  createEmployeeRetrievalTransport,
  createEmployeeVehicleDirectoryTransport,
  EmployeeCheckInSession,
  EmployeeConnectivityOwner,
  EmployeeConfirmParkedSession,
  EmployeeHandoffSession,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  EmployeeReleaseSession,
  EmployeeRetrievalSession,
  EmployeeVehicleDirectorySession,
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
import { retireNativeShiftScope } from "../shift/native-shift-retirement";
import { NativeIncidentSession } from "../incident/native-incident-session";
import { NativeGuestAccessSession } from "../guest-access/native-guest-access-session";
import { ExpoNativeConnectivityAdapter } from "../shell/expo-native-connectivity-adapter";

export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly confirmParking: EmployeeConfirmParkedSession;
  readonly connectivity: EmployeeConnectivityOwner;
  readonly dispose: () => void;
  readonly handoff: EmployeeHandoffSession;
  readonly guestAccess: NativeGuestAccessSession;
  readonly incident: NativeIncidentSession;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly release: EmployeeReleaseSession;
  readonly retrieval: EmployeeRetrievalSession;
  readonly shiftEnd: EmployeeShiftEndSession;
  readonly shiftStart: EmployeeShiftStartSession;
  readonly vehicleDirectory: EmployeeVehicleDirectorySession;
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
  const connectivity = new EmployeeConnectivityOwner(
    new ExpoNativeConnectivityAdapter(),
  );
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
  const incident = new NativeIncidentSession(() =>
    createNativeEmployeeClient(apiOrigin, auth),
  );
  const guestAccess = new NativeGuestAccessSession(
    () => createNativeEmployeeClient(apiOrigin, auth),
    { isOnline: () => connectivity.current() !== "offline" },
  );
  const vehicleDirectory = new EmployeeVehicleDirectorySession({
    transport: createEmployeeVehicleDirectoryTransport((signal) =>
      createNativeEmployeeClient(apiOrigin, auth, signal),
    ),
  });
  const shiftEnd = new EmployeeShiftEndSession({
    initialOnline: connectivity.current() !== "offline",
    onEnded: () => {
      const currentAuth = auth.current();
      if (currentAuth.phase !== "authenticated") return;
      retireNativeShiftScope(
        {
          checkIn,
          confirmParking,
          guestAccess,
          incident,
          handoff,
          operations,
          parking,
          release,
          retrieval,
          shiftStart,
          vehicleDirectory,
        },
        currentAuth.authGeneration,
      );
    },
    transport: createNativeShiftEndTransport(apiOrigin, auth),
  });
  shiftObserver.end = shiftEnd;
  connectivity.start();
  const unregisterIdentityPurge = nativeIdentityState.register(() => {
    operations.clear();
    confirmParking.clear();
    handoff.clear();
    guestAccess.clear();
    incident.clear();
    parking.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.clear();
    shiftStart.clear();
    checkIn.clear();
    vehicleDirectory.clear();
  });
  const dispose = () => {
    unregisterIdentityPurge();
    connectivity.dispose();
    operations.dispose();
    confirmParking.clear();
    handoff.clear();
    guestAccess.clear();
    incident.clear();
    parking.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.clear();
    shiftStart.clear();
    checkIn.clear();
    vehicleDirectory.clear();
  };
  return {
    apiOrigin,
    auth,
    checkIn,
    confirmParking,
    connectivity,
    dispose,
    handoff,
    guestAccess,
    incident,
    operations,
    parking,
    release,
    retrieval,
    shiftEnd,
    shiftStart,
    vehicleDirectory,
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
