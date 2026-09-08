import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeHandoffSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
  EmployeeShiftStartSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";

export interface NativeProductionBootstrap {
  readonly auth: NativeAuthSnapshot;
  readonly confirmParking: EmployeeConfirmParkedSnapshot;
  readonly handoff: EmployeeHandoffSnapshot;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly release: EmployeeReleaseSnapshot;
  readonly retrieval: EmployeeRetrievalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
  readonly shiftStart: EmployeeShiftStartSnapshot;
}

export function createNativeProductionBootstrap(): NativeProductionBootstrap {
  try {
    const runtime = createNativeEmployeeRuntime();
    return {
      auth: runtime.auth.current(),
      confirmParking: runtime.confirmParking.current(),
      handoff: runtime.handoff.current(),
      operations: runtime.operations.current(),
      parking: runtime.parking.current(),
      release: runtime.release.current(),
      retrieval: runtime.retrieval.current(),
      runtime,
      shiftStart: runtime.shiftStart.current(),
    };
  } catch {
    return {
      auth: {
        authGeneration: 0,
        phase: "fatal",
        reason: "configuration-failure",
      },
      confirmParking: {
        conflict: null,
        failure: null,
        identityGeneration: null,
        keySlotCandidate: "",
        parked: null,
        parkingSpotCandidate: "",
        phase: "inactive",
        scope: null,
        session: null,
        task: null,
      },
      handoff: {
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        scope: null,
        session: null,
        task: null,
      },
      operations: {
        contextFailure: null,
        identityGeneration: null,
        mutation: { phase: "idle" },
        phase: "inactive",
        queueFailure: null,
        queueHardStopped: false,
        queueLoading: false,
        queueRefreshing: false,
        scope: null,
        successfulQueueSnapshotCount: 0,
        tasks: [],
      },
      parking: {
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        scope: null,
        session: null,
        task: null,
      },
      release: {
        block: null,
        completion: null,
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        releaseRequiresPayment: null,
        releaseSatisfied: null,
        scope: null,
        session: null,
        task: null,
      },
      retrieval: {
        failure: null,
        identityGeneration: null,
        keyConfirmed: false,
        keySlotCandidate: "",
        phase: "inactive",
        readyAt: null,
        retrievalStartedAt: null,
        scope: null,
        session: null,
        task: null,
      },
      runtime: undefined,
      shiftStart: {
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        selectedLocationId: null,
        startableLocations: [],
        targetLocationId: null,
      },
    };
  }
}
