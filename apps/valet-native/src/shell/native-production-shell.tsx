import { useEffect, useState } from "react";
import type {
  EmployeeConfirmParkedSnapshot,
  EmployeeOperationalSnapshot,
  EmployeeParkingStartSnapshot,
  EmployeeShiftStartSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { AppState, BackHandler } from "react-native";

import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";
import { checkInBackBlocked } from "../check-in/native-check-in-presentation";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { nativeParkingBackBlocked } from "../parking/native-parking-protection";
import { useNativeRetrievalAttention } from "../tasks/use-native-retrieval-attention";
import { NativeProductionWorkspace } from "./native-production-workspace";
import { NativeShellGate } from "./native-shell-gate";
import {
  ProductionShellController,
  type ProductionDestination,
  type ProductionRouteIntent,
} from "./production-shell-controller";

interface Bootstrap {
  readonly auth: NativeAuthSnapshot;
  readonly confirmParking: EmployeeConfirmParkedSnapshot;
  readonly operations: EmployeeOperationalSnapshot;
  readonly parking: EmployeeParkingStartSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
  readonly shiftStart: EmployeeShiftStartSnapshot;
}

function createBootstrap(): Bootstrap {
  try {
    const runtime = createNativeEmployeeRuntime();
    return {
      auth: runtime.auth.current(),
      confirmParking: runtime.confirmParking.current(),
      operations: runtime.operations.current(),
      parking: runtime.parking.current(),
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

export function NativeProductionShell({
  coldIntent = null,
}: {
  readonly coldIntent?: ProductionRouteIntent | null;
}) {
  const [locale, setLocale] = useState<FoundationLocale>("en");
  const [bootstrap] = useState(createBootstrap);
  const [authSnapshot, setAuthSnapshot] = useState(bootstrap.auth);
  const [confirmParking, setConfirmParking] = useState(
    bootstrap.confirmParking,
  );
  const [operations, setOperations] = useState(bootstrap.operations);
  const [parking, setParking] = useState(bootstrap.parking);
  const [shiftStart, setShiftStart] = useState(bootstrap.shiftStart);
  const [controller] = useState(() => {
    const productionController = new ProductionShellController();
    if (coldIntent !== null) productionController.receive(coldIntent);
    return productionController;
  });
  const [, setNavigationRevision] = useState(0);
  const runtime = bootstrap.runtime;
  const shell = controller.update(authSnapshot, operations);
  const workflowPurgeRevision = controller.currentWorkflowPurgeRevision();
  const retrievalAttention = useNativeRetrievalAttention(operations);

  useEffect(() => {
    if (runtime === undefined) return;
    const unsubscribeAuth = runtime.auth.subscribe(setAuthSnapshot);
    const unsubscribeConfirmParking =
      runtime.confirmParking.subscribe(setConfirmParking);
    const unsubscribeOperations = runtime.operations.subscribe(setOperations);
    const unsubscribeParking = runtime.parking.subscribe(setParking);
    const unsubscribeShiftStart = runtime.shiftStart.subscribe(setShiftStart);
    void runtime.auth.start();
    return () => {
      unsubscribeAuth();
      unsubscribeConfirmParking();
      unsubscribeOperations();
      unsubscribeParking();
      unsubscribeShiftStart();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    if (runtime === undefined) return;
    if (authSnapshot.phase === "authenticated") {
      runtime.shiftStart.activate(authSnapshot.authGeneration);
      void runtime.operations.activate(authSnapshot.authGeneration);
    } else {
      runtime.confirmParking.clear();
      runtime.parking.clear();
      runtime.shiftStart.clear();
      runtime.operations.clear();
    }
  }, [authSnapshot.authGeneration, authSnapshot.phase, runtime]);

  useEffect(() => {
    if (runtime === undefined || workflowPurgeRevision === 0) return;
    runtime.checkIn.clear();
    runtime.confirmParking.clear();
    runtime.parking.clear();
  }, [runtime, workflowPurgeRevision]);

  useEffect(() => {
    if (runtime === undefined) return;
    void runtime.operations.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      void runtime.operations.setForeground(state === "active");
      if (
        state === "active" &&
        runtime.confirmParking.current().phase !== "inactive"
      ) {
        void runtime.confirmParking.checkServerState();
      } else if (
        state === "active" &&
        runtime.parking.current().phase !== "inactive"
      ) {
        void runtime.parking.checkServerState();
      }
    });
    return () => {
      subscription.remove();
      void runtime.operations.setForeground(false);
    };
  }, [runtime]);

  useEffect(() => {
    const task = parking.task;
    const session = parking.session;
    if (
      runtime === undefined ||
      parking.phase !== "started" ||
      parking.identityGeneration === null ||
      parking.scope === null ||
      task === null ||
      session === null ||
      runtime.parking.current() !== parking ||
      runtime.confirmParking.current().phase !== "inactive"
    )
      return;
    void runtime.confirmParking.open(
      parking.identityGeneration,
      parking.scope,
      task.taskId,
      session.sessionId,
    );
  }, [parking, runtime]);

  const navigate = (destination: ProductionDestination) => {
    controller.receive({ destination, source: "navigation" });
    setNavigationRevision((value) => value + 1);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (shell.kind !== "active" || shell.destination === "tasks") {
          return false;
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          checkInBackBlocked(
            runtime.checkIn.current().phase,
            runtime.checkIn.current().continuation?.mode,
          )
        ) {
          return true;
        }
        if (
          runtime !== undefined &&
          shell.destination === "parking" &&
          nativeParkingBackBlocked(
            runtime.parking.current().phase,
            runtime.confirmParking.current().phase,
          )
        ) {
          return true;
        }
        if (runtime !== undefined && shell.destination === "parking") {
          const confirmPhase = runtime.confirmParking.current().phase;
          if (confirmPhase === "slot" || confirmPhase === "ready") {
            runtime.confirmParking.backToSpot();
            return true;
          }
          runtime.confirmParking.clear();
          runtime.parking.clear();
          void runtime.operations.refreshQueue();
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          runtime.checkIn.current().phase === "created" &&
          runtime.checkIn.current().continuation?.mode !== "view"
        ) {
          runtime.checkIn.cancelVehicleEdit();
          return true;
        }
        runtime?.checkIn.clear();
        const handled = controller.back();
        if (handled) setNavigationRevision((value) => value + 1);
        return handled;
      },
    );
    return () => subscription.remove();
  }, [controller, runtime, shell]);

  if (shell.kind !== "active" || runtime === undefined) {
    return (
      <NativeShellGate
        auth={runtime?.auth}
        authSnapshot={authSnapshot}
        locale={locale}
        onRetryContext={() => void runtime?.operations.refresh()}
        onSelectLocale={setLocale}
        onSignOut={() => void runtime?.auth.logout()}
        shiftStart={runtime?.shiftStart}
        shiftStartSnapshot={shiftStart}
        state={shell.kind === "active" ? { kind: "auth-error" } : shell}
      />
    );
  }

  return (
    <NativeProductionWorkspace
      authSnapshot={authSnapshot}
      locale={locale}
      confirmParking={confirmParking}
      navigate={navigate}
      onSelectLocale={setLocale}
      operations={operations}
      parking={parking}
      retrievalAttention={retrievalAttention}
      runtime={runtime}
      shell={shell}
    />
  );
}
