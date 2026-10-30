import { createNativeCheckInRuntime } from "./native-check-in-runtime";
import { createNativeParkingCancellation } from "../parking/native-parking-cancellation-runtime";
import type { NativeCheckInActions } from "../check-in/native-check-in-actions";
import {
  createEmployeeConfirmParkedTransport,
  createEmployeeHandoffTransport,
  createEmployeeParkingStartTransport,
  createEmployeeReleaseTransport,
  createEmployeeRetrievalTransport,
  EmployeeCheckInSession,
  EmployeeConnectivityOwner,
  EmployeeConfirmParkedSession,
  EmployeeHandoffSession,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  type EmployeeParkingCancellationSession,
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
} from "../tasks/native-operational-http";
import { createNativeShiftRuntime } from "../shift/native-shift-runtime";
import { NativeIncidentSession } from "../incident/native-incident-session";
import { createNativeIncidentContextObserver } from "../incident/native-incident-context-observer";
import { ExpoIncidentRecoveryStore } from "../incident/native-incident-recovery-store";
import { createNativeIncidentRecoveryState } from "../incident/native-incident-recovery-runtime";
import { NativeGuestAccessSession } from "../guest-access/native-guest-access-session";
import { ExpoNativeConnectivityAdapter } from "../shell/expo-native-connectivity-adapter";
import {
  createNativeTaskTrackingRuntime,
  type NativeTaskTrackingRuntime,
} from "../tracking/native-task-tracking-runtime";
export interface NativeEmployeeRuntime {
  readonly apiOrigin: string;
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly checkInActions: NativeCheckInActions;
  readonly confirmParking: EmployeeConfirmParkedSession;
  readonly connectivity: EmployeeConnectivityOwner;
  readonly dispose: () => void;
  readonly handoff: EmployeeHandoffSession;
  readonly guestAccess: NativeGuestAccessSession;
  readonly incident: NativeIncidentSession;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly parkingCancellation: EmployeeParkingCancellationSession;
  readonly release: EmployeeReleaseSession;
  readonly retrieval: EmployeeRetrievalSession;
  readonly shiftEnd: EmployeeShiftEndSession;
  readonly shiftStart: EmployeeShiftStartSession;
  readonly taskTracking: NativeTaskTrackingRuntime;
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
  const incidentStore = new ExpoIncidentRecoveryStore();
  const installationStore = new ExpoInstallationAuthStateStore();
  const connectivity = new EmployeeConnectivityOwner(
    new ExpoNativeConnectivityAdapter(),
  );
  const incident = new NativeIncidentSession(
    () => createNativeEmployeeClient(apiOrigin, auth),
    createNativeIncidentRecoveryState(incidentStore, () =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
    () => operations.refresh(),
  );
  const shiftObserver: {
    end?: EmployeeShiftEndSession;
    start?: EmployeeShiftStartSession;
  } = {};
  const incidentContext = createNativeIncidentContextObserver(
    incident,
    auth,
    incidentStore,
    installationStore,
  );
  const operations = new EmployeeOperationalSession({
    initialForeground: false,
    onOperationalContext: (identityGeneration, response) => {
      void incidentContext.observe(identityGeneration, response);
      shiftObserver.start?.observeOperationalContext(
        identityGeneration,
        response,
      );
      shiftObserver.end?.observeOperationalContext(
        identityGeneration,
        response,
      );
      void presence
        .restore(identityGeneration, response)
        .catch(() => undefined);
    },
    transport: createNativeOperationalTransport(apiOrigin, auth),
  });
  const taskTracking = createNativeTaskTrackingRuntime(
    apiOrigin,
    auth,
    operations,
  );
  const { shiftStart, shiftEnd, presence } = createNativeShiftRuntime(
    apiOrigin,
    auth,
    operations,
    connectivity,
    () => ({
      checkIn,
      checkInActions,
      confirmParking,
      guestAccess,
      incident,
      handoff,
      operations,
      parking,
      parkingCancellation,
      release,
      retrieval,
      shiftStart,
      taskTracking,
      vehicleDirectory,
    }),
  );
  shiftObserver.start = shiftStart;
  shiftObserver.end = shiftEnd;
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
  const parkingCancellation = createNativeParkingCancellation(
    apiOrigin,
    auth,
    operations,
    parking,
    confirmParking,
  );
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
  taskTracking.bindMovementCompletion(confirmParking, retrieval);
  const { checkIn, vehicleDirectory, checkInActions } =
    createNativeCheckInRuntime(
      apiOrigin,
      auth,
      operations,
      () => connectivity.current() !== "offline",
    );
  const guestAccess = new NativeGuestAccessSession(
    () => createNativeEmployeeClient(apiOrigin, auth),
    { isOnline: () => connectivity.current() !== "offline" },
  );
  connectivity.start();
  const unregisterIdentityPurge = nativeIdentityState.register(async () => {
    incidentContext.invalidate();
    operations.clear();
    confirmParking.clear();
    handoff.clear();
    guestAccess.clear();
    await incident.purgeRecovery();
    await presence.purge();
    parking.clear();
    parkingCancellation.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.clear();
    shiftStart.clear();
    checkIn.clear();
    checkInActions.clear();
    vehicleDirectory.clear();
  });
  const dispose = () => {
    incidentContext.invalidate();
    unregisterIdentityPurge();
    taskTracking.dispose();
    connectivity.dispose();
    operations.dispose();
    confirmParking.clear();
    handoff.clear();
    guestAccess.clear();
    incident.clear();
    parking.clear();
    parkingCancellation.clear();
    release.clear();
    retrieval.clear();
    shiftEnd.suspendForBackground();
    shiftStart.suspendForBackground();
    checkIn.clear();
    checkInActions.clear();
    vehicleDirectory.clear();
  };
  return {
    apiOrigin,
    auth,
    checkIn,
    checkInActions,
    confirmParking,
    connectivity,
    dispose,
    handoff,
    guestAccess,
    incident,
    operations,
    parking,
    parkingCancellation,
    release,
    retrieval,
    shiftEnd,
    shiftStart,
    taskTracking,
    vehicleDirectory,
  };
}
