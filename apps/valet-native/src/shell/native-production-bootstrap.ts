import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeHandoffSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
  EmployeeShiftEndSnapshot,
  EmployeeShiftStartSnapshot,
  EmployeeVehicleDirectorySnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { createNativeTelemetry } from "../telemetry/native-telemetry-provenance";

export interface NativeProductionBootstrap {
  readonly auth: NativeAuthSnapshot;
  readonly confirmParking: EmployeeConfirmParkedSnapshot;
  readonly handoff: EmployeeHandoffSnapshot;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly release: EmployeeReleaseSnapshot;
  readonly retrieval: EmployeeRetrievalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
  readonly shiftEnd: EmployeeShiftEndSnapshot;
  readonly shiftStart: EmployeeShiftStartSnapshot;
  readonly vehicleDirectory: EmployeeVehicleDirectorySnapshot;
}

export function createNativeProductionBootstrap(): NativeProductionBootstrap {
  try {
    // Telemetry first: it must exist (and be fail-open) before any session
    // is created, so every runtime client records from the start. Its own
    // construction failure must fall back to the no-op registry rather than
    // ever reaching the fatal-configuration path below.
    try {
      createNativeTelemetry();
    } catch {
      /* fail-open: registry stays no-op; the app must still boot */
    }
    // ONE process-bootstrap "cold-start" lifecycle event. This is the
    // truthful boundary: NativeProductionShell creates one bootstrap through
    // a React useState initializer for the mounted production root (the
    // initializer is not re-invoked on an ordinary re-render).
    // It is deliberately DISTINCT from the foreground/background events
    // emitted by useNativeProductionLifecycle, which observe AppState
    // transitions during an already-running process. Recording stays fail-open:
    // telemetry can never break bootstrap.
    try {
      getNativeTelemetry().record({
        classification: "cold-start",
        outcome: "success",
        source: "lifecycle",
      });
    } catch {
      /* fail-open: the cold-start event is an observation, never a gate */
    }
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
      shiftEnd: runtime.shiftEnd.current(),
      shiftStart: runtime.shiftStart.current(),
      vehicleDirectory: runtime.vehicleDirectory.current(),
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
        keySlotResourceId: null,
        parked: null,
        parkingSpotCandidate: "",
        parkingSpotResourceId: null,
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
        activeShiftCount: null,
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
        keySlotResourceId: null,
        phase: "inactive",
        readyAt: null,
        retrievalStartedAt: null,
        scope: null,
        session: null,
        task: null,
      },
      runtime: undefined,
      shiftEnd: {
        authority: null,
        cashInput: "",
        cashValidationVisible: false,
        failure: null,
        identityGeneration: null,
        online: true,
        phase: "inactive",
        result: null,
      },
      shiftStart: {
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        selectedLocationId: null,
        startableLocations: [],
        targetLocationId: null,
      },
      vehicleDirectory: {
        failure: null,
        identityGeneration: null,
        page: null,
        phase: "inactive",
        scope: null,
      },
    };
  }
}
